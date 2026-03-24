'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { getMatrixClient, getCrossSigningStatus, requestSelfVerification, restoreFromRecoveryKey } from '@/lib/matrix/client'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import * as sdk from 'matrix-js-sdk'
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent'
import type { VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationDialog } from '@/components/chat/verification-dialog'
import { CallOverlay } from '@/components/chat/call-overlay'
import { NewSessionBanner } from '@/components/chat/new-session-banner'
import { setupIncomingCallListener } from '@/lib/matrix/voip'
import { playNotificationSound, playSeenSound } from '@/lib/notification-sound'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null)
  const [showNewSessionBanner, setShowNewSessionBanner] = useState(false)
  const [sessionVerifyError, setSessionVerifyError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const client = getMatrixClient()
    if (!client) return

    const { loadRooms, loadMessages, unarchiveRoom, markAsRead } = useChatStore.getState()

    // --- Debounce helpers ---
    // Debounce loadRooms so rapid-fire events batch together
    let loadRoomsTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedLoadRooms = () => {
      if (loadRoomsTimer) clearTimeout(loadRoomsTimer)
      loadRoomsTimer = setTimeout(() => {
        loadRooms()
        loadRoomsTimer = null
      }, 300)
    }

    // Debounce loadMessages per room (only active room matters)
    let loadMessagesTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedLoadMessages = (roomId: string) => {
      if (loadMessagesTimer) clearTimeout(loadMessagesTimer)
      loadMessagesTimer = setTimeout(() => {
        const currentActiveRoom = useChatStore.getState().activeRoom
        if (currentActiveRoom?.roomId === roomId) {
          loadMessages(roomId)
        }
        loadMessagesTimer = null
      }, 150)
    }

    // Track whether timeline events fired for the ACTIVE room during this sync cycle
    // so onSync doesn't redundantly reload messages
    let activeRoomTimelineEventFired = false
    let syncCycleResetTimer: ReturnType<typeof setTimeout> | null = null

    // Listen for new timeline events (messages, reactions, redactions)
    const onTimelineEvent = (
      event: sdk.MatrixEvent,
      room: sdk.Room | undefined,
      _toStartOfTimeline?: boolean,
      _removed?: boolean,
      data?: { liveEvent?: boolean },
    ) => {
      if (!room) return

      // Reset the flag after a short window (sync events come in bursts)
      if (syncCycleResetTimer) clearTimeout(syncCycleResetTimer)
      syncCycleResetTimer = setTimeout(() => {
        activeRoomTimelineEventFired = false
      }, 500)

      // If a new message arrives in an archived room, unarchive it
      const eventType = event.getType()
      if (
        (eventType === 'm.room.message' || eventType === 'm.room.encrypted') &&
        data?.liveEvent
      ) {
        const tags = room.tags || {}
        if ('m.lowpriority' in tags) {
          unarchiveRoom(room.roomId)
        }
      }

      // Refresh the room list (debounced)
      debouncedLoadRooms()

      // If this is the active room, reload messages (debounced)
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        activeRoomTimelineEventFired = true
        debouncedLoadMessages(room.roomId)
      }

      // If a live message arrived in the active room, mark it as read immediately
      // so the sidebar unread badge stays cleared
      if (
        (eventType === 'm.room.message' || eventType === 'm.room.encrypted') &&
        data?.liveEvent &&
        currentActiveRoom?.roomId === room.roomId
      ) {
        markAsRead(room.roomId)
      }

      // Sound + browser notification for messages from others
      if (
        (eventType === 'm.room.message' || eventType === 'm.room.encrypted') &&
        event.getSender() !== user.userId &&
        data?.liveEvent
      ) {
        // Only play sound if the message is NOT in the active room, or if the tab is hidden
        if (!currentActiveRoom || currentActiveRoom.roomId !== room.roomId || document.hidden) {
          playNotificationSound()
        }

        // Show browser notification only when tab is hidden
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const senderName = room.getMember(event.getSender()!)?.name || event.getSender()
          const clearContent = (event as any).getClearContent?.()
          const content = clearContent || event.getContent()
          const body = content?.body || 'New message'
          new Notification(`${senderName} in ${room.name}`, {
            body: body.substring(0, 100),
            icon: '/favicon.ico',
          })
        }
      }
    }

    // When an encrypted event gets decrypted, reload messages immediately (not debounced)
    // since decryption is critical for showing message content
    const onEventDecrypted = (event: sdk.MatrixEvent) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom && event.getRoomId() === currentActiveRoom.roomId) {
        loadMessages(currentActiveRoom.roomId)
      }
      // Also refresh sidebar for last message preview (debounced)
      debouncedLoadRooms()
    }

    // After each sync completes, refresh room list and active room messages
    // Skip message reload if timeline events already handled it this cycle
    const onSync = (state: string) => {
      if (state === 'SYNCING') {
        debouncedLoadRooms()
        if (!activeRoomTimelineEventFired) {
          const currentActiveRoom = useChatStore.getState().activeRoom
          if (currentActiveRoom) {
            debouncedLoadMessages(currentActiveRoom.roomId)
          }
        }
      }
    }

    // Listen for room membership changes
    const onRoomMembership = () => {
      debouncedLoadRooms()
    }

    // Listen for typing notifications
    const onRoomTyping = (_event: sdk.MatrixEvent, room: sdk.Room) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        const typingMembers = (room as any).getTypingMembers?.() || []
        const typingNames = typingMembers
          .filter((m: any) => m.userId !== user.userId)
          .map((m: any) => m.name || m.userId)
        useChatStore.setState({ typingUsers: typingNames })
      }
    }

    // Listen for read receipts - only reload if active room
    // Play a subtle "seen" sound when someone reads our message
    let lastSeenSoundTs = 0
    const onReceipt = (_event: sdk.MatrixEvent, room: sdk.Room) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        debouncedLoadMessages(room.roomId)

        // Play seen sound at most once per 3 seconds
        const now = Date.now()
        if (now - lastSeenSoundTs > 3000) {
          lastSeenSoundTs = now
          playSeenSound()
        }
      }
    }

    // Handle timeline reset (e.g. when room is re-synced)
    const onTimelineReset = (room: sdk.Room | undefined) => {
      if (!room) return
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom?.roomId === room.roomId) {
        loadMessages(room.roomId) // Immediate reload on reset, not debounced
      }
      debouncedLoadRooms()
    }

    // Listen for incoming verification requests
    const onVerificationRequest = (request: VerificationRequest) => {
      console.log('Verification request received:', request.otherUserId, 'phase:', request.phase)
      setVerificationRequest(request)
    }

    // Listen for room member changes (avatar, name updates from bridges)
    const onRoomMemberChange = () => {
      debouncedLoadRooms()
    }

    // Listen for event status changes (queued → sending → sent/failed)
    // so the UI updates when the scheduler retries or gives up
    const onEventStatus = (event: sdk.MatrixEvent) => {
      const currentActiveRoom = useChatStore.getState().activeRoom
      if (currentActiveRoom && event.getRoomId() === currentActiveRoom.roomId) {
        debouncedLoadMessages(currentActiveRoom.roomId)
      }
    }

    client.on(sdk.RoomEvent.Timeline, onTimelineEvent)
    client.on(sdk.RoomEvent.TimelineReset, onTimelineReset)
    client.on(sdk.RoomEvent.MyMembership, onRoomMembership)
    client.on(sdk.RoomEvent.Receipt, onReceipt)
    client.on(sdk.MatrixEventEvent.Decrypted, onEventDecrypted)
    client.on(sdk.MatrixEventEvent.Status as any, onEventStatus)
    client.on(sdk.ClientEvent.Sync, onSync)
    client.on('RoomMember.typing' as any, onRoomTyping)
    client.on(sdk.RoomMemberEvent.Membership as any, onRoomMemberChange)
    client.on(sdk.RoomMemberEvent.Name as any, onRoomMemberChange)
    client.on(sdk.RoomStateEvent.Events as any, onRoomMemberChange)
    client.on(CryptoEvent.VerificationRequestReceived as any, onVerificationRequest)

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Check cross-signing status after sync — prompt verification if needed
    const checkCrossSigning = async () => {
      try {
        // Skip if user previously dismissed the banner
        if (localStorage.getItem('matrix_verify_banner_dismissed') === 'true') return
        const status = await getCrossSigningStatus()
        if (status.exists && !status.thisDeviceVerified) {
          setShowNewSessionBanner(true)
        }
      } catch {
        // ignore
      }
    }
    // Small delay to let sync settle
    const csTimer = setTimeout(checkCrossSigning, 3000)


    // Set up incoming VoIP call listener
    const cleanupCallListener = setupIncomingCallListener()

    // Auto-archive inactive conversations every 5 minutes.
    // Rooms with no message activity for 1 hour get archived,
    // unless the user is currently viewing them or they have unread messages.
    const AUTO_ARCHIVE_INACTIVITY_MS = 1 * 60 * 60 * 1000 // 1 hour
    const AUTO_ARCHIVE_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
    const autoArchiveInterval = setInterval(() => {
      const { rooms, activeRoom, archiveRoom } = useChatStore.getState()
      const now = Date.now()
      for (const room of rooms) {
        if (room.isArchived) continue
        if (room.roomId === activeRoom?.roomId) continue
        if (room.unreadCount > 0) continue
        if (room.lastMessageTs > 0 && now - room.lastMessageTs > AUTO_ARCHIVE_INACTIVITY_MS) {
          archiveRoom(room.roomId)
        }
      }
    }, AUTO_ARCHIVE_CHECK_INTERVAL)

    return () => {
      // Clean up debounce timers
      if (loadRoomsTimer) clearTimeout(loadRoomsTimer)
      if (loadMessagesTimer) clearTimeout(loadMessagesTimer)
      if (syncCycleResetTimer) clearTimeout(syncCycleResetTimer)
      clearTimeout(csTimer)
      clearInterval(autoArchiveInterval)

      // Clean up call listener
      cleanupCallListener?.()

      client.removeListener(sdk.RoomEvent.Timeline, onTimelineEvent)
      client.removeListener(sdk.RoomEvent.TimelineReset, onTimelineReset)
      client.removeListener(sdk.RoomEvent.MyMembership, onRoomMembership)
      client.removeListener(sdk.RoomEvent.Receipt, onReceipt)
      client.removeListener(sdk.MatrixEventEvent.Decrypted, onEventDecrypted)
      client.removeListener(sdk.MatrixEventEvent.Status as any, onEventStatus)
      client.removeListener(sdk.ClientEvent.Sync, onSync)
      client.removeListener('RoomMember.typing' as any, onRoomTyping)
      client.removeListener(sdk.RoomMemberEvent.Membership as any, onRoomMemberChange)
      client.removeListener(sdk.RoomMemberEvent.Name as any, onRoomMemberChange)
      client.removeListener(sdk.RoomStateEvent.Events as any, onRoomMemberChange)
      client.removeListener(CryptoEvent.VerificationRequestReceived as any, onVerificationRequest)
    }
  }, [user]) // Only re-run when user changes (login/logout). All handlers read current state from store.

  const handleVerifyWithSession = useCallback(async () => {
    try {
      setSessionVerifyError(null)
      const request = await requestSelfVerification()
      setVerificationRequest(request)
      setShowNewSessionBanner(false)
    } catch (err: any) {
      console.error('Failed to request self-verification:', err)
      const msg = err?.message || String(err)
      if (msg.toLowerCase().includes('not implemented') || msg.toLowerCase().includes('not supported')) {
        setSessionVerifyError('Interactive verification is not available. Please use a security key instead.')
      } else {
        setSessionVerifyError('Failed to start verification. Please try the security key method.')
      }
    }
  }, [])

  const handleVerifyWithKey = useCallback(async (key: string) => {
    await restoreFromRecoveryKey(key)
    setShowNewSessionBanner(false)
  }, [])

  return (
    <>
      {children}
      <CallOverlay />
      {showNewSessionBanner && !verificationRequest && (
        <NewSessionBanner
          onVerifyWithSession={handleVerifyWithSession}
          onVerifyWithKey={handleVerifyWithKey}
          sessionVerifyError={sessionVerifyError}
          onDismiss={() => {
            localStorage.setItem('matrix_verify_banner_dismissed', 'true')
            setShowNewSessionBanner(false)
          }}
        />
      )}
      {verificationRequest && (
        <VerificationDialog
          request={verificationRequest}
          onClose={() => setVerificationRequest(null)}
        />
      )}
    </>
  )
}
