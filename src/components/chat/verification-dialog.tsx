'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { DotGrid } from '@/components/ui/dot-grid'
import type {
  VerificationRequest,
  ShowSasCallbacks,
  EmojiMapping,
} from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationPhase, VerificationRequestEvent, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification'

interface VerificationDialogProps {
  request: VerificationRequest
  onClose: () => void
}

type DialogState =
  | { step: 'incoming' }
  | { step: 'waiting' }
  | { step: 'sas'; emojis: EmojiMapping[]; sasCallbacks: ShowSasCallbacks }
  | { step: 'done' }
  | { step: 'cancelled'; reason?: string }

export function VerificationDialog({ request, onClose }: VerificationDialogProps) {
  const [state, setState] = useState<DialogState>(() => {
    if (request.phase === VerificationPhase.Requested && !request.initiatedByMe) {
      return { step: 'incoming' }
    }
    return { step: 'waiting' }
  })

  // Attach verifier listeners whenever a verifier becomes available
  const attachVerifierListeners = useCallback((verifier: any) => {
    if (!verifier) return

    const onShowSas = (sas: ShowSasCallbacks) => {
      if (sas.sas.emoji) {
        setState({ step: 'sas', emojis: sas.sas.emoji, sasCallbacks: sas })
      }
    }
    const onCancel = () => {
      setState({ step: 'cancelled' })
    }

    verifier.on(VerifierEvent.ShowSas, onShowSas)
    verifier.on(VerifierEvent.Cancel, onCancel)

    // Check if SAS is already available
    const sas = verifier.getShowSasCallbacks?.()
    if (sas?.sas?.emoji) {
      setState({ step: 'sas', emojis: sas.sas.emoji, sasCallbacks: sas })
    }
  }, [])

  const handleChange = useCallback(() => {
    const phase = request.phase
    if (phase === VerificationPhase.Cancelled) {
      setState({ step: 'cancelled', reason: request.cancellationCode || undefined })
      return
    }
    if (phase === VerificationPhase.Done) {
      setState({ step: 'done' })
      return
    }
    if (phase === VerificationPhase.Started || phase === VerificationPhase.Ready) {
      const verifier = request.verifier
      if (verifier) {
        attachVerifierListeners(verifier)
        const sas = verifier.getShowSasCallbacks?.()
        if (sas?.sas?.emoji) {
          setState({ step: 'sas', emojis: sas.sas.emoji, sasCallbacks: sas })
          return
        }
      }
      // When phase is Ready and we accepted an incoming request, try to start verification
      if (phase === VerificationPhase.Ready && !request.initiatedByMe && request.methods?.includes('m.sas.v1')) {
        request.startVerification('m.sas.v1').then((verifier: any) => {
          attachVerifierListeners(verifier)
          verifier.verify().catch(() => {
            setState({ step: 'cancelled' })
          })
        }).catch((err: any) => {
          console.error('Failed to start verification:', err)
          // Don't cancel — the other side may start it
        })
      }
      if (state.step !== 'sas') {
        setState({ step: 'waiting' })
      }
    }
  }, [request, state.step, attachVerifierListeners])

  useEffect(() => {
    request.on(VerificationRequestEvent.Change, handleChange)
    // Check initial state in case we missed events
    handleChange()
    return () => {
      request.off(VerificationRequestEvent.Change, handleChange)
    }
  }, [request, handleChange])

  // Also listen on the verifier for ShowSas events
  useEffect(() => {
    const verifier = request.verifier
    if (!verifier) return
    attachVerifierListeners(verifier)
  }, [request.verifier, attachVerifierListeners])

  const handleAccept = async () => {
    try {
      setState({ step: 'waiting' })

      // Check if the request is still in a state where we can accept
      if (request.phase !== VerificationPhase.Requested) {
        console.warn('Verification request already moved past Requested phase:', request.phase)
        // It may have already been accepted or transitioned — just wait for events
        return
      }

      await request.accept()
      // Don't start verification here — the handleChange listener will handle it
      // when the phase transitions to Ready
    } catch (err) {
      console.error('Failed to accept verification:', err)
      setState({ step: 'cancelled', reason: 'Failed to accept. Try again from the other device.' })
    }
  }

  const handleDecline = async () => {
    try {
      await request.cancel()
    } catch {
      // ignore
    }
    onClose()
  }

  const handleSasConfirm = async () => {
    if (state.step !== 'sas') return
    try {
      setState({ step: 'waiting' })
      await state.sasCallbacks.confirm()
    } catch (err) {
      console.error('SAS confirm failed:', err)
      setState({ step: 'cancelled' })
    }
  }

  const handleSasMismatch = () => {
    if (state.step !== 'sas') return
    state.sasCallbacks.mismatch()
    setState({ step: 'cancelled', reason: 'Emoji mismatch' })
  }

  const otherUser = request.otherUserId
  const isSelf = request.isSelfVerification

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md animate-slide-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <DotGrid />
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-800">
          <ShieldCheck className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isSelf ? 'Verify Session' : 'Verify User'}
          </h2>
        </div>

        {/* Body */}
        <div className="p-6">
          {state.step === 'incoming' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                {isSelf
                  ? 'Another session is requesting verification. Accept to share encryption keys between your sessions.'
                  : `${otherUser} wants to verify with you.`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-xl font-medium transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={handleDecline}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 py-2.5 px-4 rounded-xl font-medium transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {state.step === 'waiting' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-gray-600 dark:text-gray-300">Waiting for the other side...</p>
            </div>
          )}

          {state.step === 'sas' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Compare the emojis below with the other device. If they match, the session is verified.
              </p>
              <div className="grid grid-cols-7 gap-1 rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                {state.emojis.map(([emoji, name], i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-2xl">{emoji}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{name}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSasConfirm}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  They Match
                </button>
                <button
                  onClick={handleSasMismatch}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  No Match
                </button>
              </div>
            </div>
          )}

          {state.step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <ShieldCheck className="w-12 h-12 text-green-500" />
              <p className="text-green-600 dark:text-green-400 font-medium">Verification Complete!</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                {isSelf
                  ? 'Your session is now verified. Encrypted messages will be shared between your sessions.'
                  : `${otherUser} is now verified.`}
              </p>
              <button
                onClick={onClose}
                className="mt-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 py-2.5 px-6 rounded-xl font-medium transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {state.step === 'cancelled' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <ShieldAlert className="w-12 h-12 text-red-500" />
              <p className="text-red-600 dark:text-red-400 font-medium">Verification Cancelled</p>
              {state.reason && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">{state.reason}</p>
              )}
              <button
                onClick={onClose}
                className="mt-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 py-2.5 px-6 rounded-xl font-medium transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
