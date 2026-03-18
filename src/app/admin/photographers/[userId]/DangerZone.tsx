"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  changePlanAction,
  suspendAccountAction,
  unsuspendAccountAction,
  deleteAccountAction,
} from "../actions";
import { resetPasswordAction } from "./actions";

// ─── Shared modal primitives ──────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{msg}</p>;
}

function BtnRow({ onCancel, onConfirm, label, cls, pending }: {
  onCancel: () => void; onConfirm: () => void; label: string; cls: string; pending: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button onClick={onCancel} disabled={pending} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${cls}`}>
        {pending ? "Please wait…" : label}
      </button>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ChangePlanModal({ userId, currentPlan, planOptions, onClose, onDone }: {
  userId: string; currentPlan: "FREE" | "PRO" | "STUDIO";
  planOptions: { value: "FREE" | "PRO" | "STUDIO"; label: string; desc: string }[];
  onClose: () => void; onDone: () => void;
}) {
  const [selected, setSelected] = useState<"FREE" | "PRO" | "STUDIO">(currentPlan);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const plans = planOptions;
  return (
    <ModalShell title="Change Plan" onClose={onClose}>
      {error && <ErrMsg msg={error} />}
      <div className="mb-4 space-y-2">
        {plans.map((p) => (
          <label key={p.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${selected === p.value ? "border-blue-500 bg-blue-50" : "border-zinc-200 hover:border-zinc-300"}`}>
            <input type="radio" name="plan" value={p.value} checked={selected === p.value} onChange={() => setSelected(p.value)} className="accent-blue-600" />
            <div>
              <p className="text-sm font-medium text-zinc-900">{p.label}</p>
              <p className="text-xs text-zinc-400">{p.desc}</p>
            </div>
          </label>
        ))}
      </div>
      <BtnRow
        onCancel={onClose}
        onConfirm={() => {
          if (selected === currentPlan) { onClose(); return; }
          start(async () => {
            const r = await changePlanAction(userId, selected);
            if (r.error) { setError(r.error); return; }
            onDone();
          });
        }}
        label="Save Plan"
        cls="bg-blue-600 hover:bg-blue-700"
        pending={pending}
      />
    </ModalShell>
  );
}

function SuspendModal({ userId, userName, onClose, onDone }: {
  userId: string; userName: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError]   = useState("");
  const [pending, start]    = useTransition();
  return (
    <ModalShell title="Suspend Account" onClose={onClose}>
      {error && <ErrMsg msg={error} />}
      <p className="mb-4 text-sm text-zinc-500">
        <strong className="text-zinc-800">{userName}</strong> will be immediately locked out. You can unsuspend at any time.
      </p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700">Reason <span className="text-zinc-400">(optional)</span></label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Policy violation, abuse, etc." className="mt-1.5 block w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
      </div>
      <BtnRow
        onCancel={onClose}
        onConfirm={() => start(async () => {
          const r = await suspendAccountAction(userId, reason);
          if (r.error) { setError(r.error); return; }
          onDone();
        })}
        label="Suspend Account"
        cls="bg-red-600 hover:bg-red-700"
        pending={pending}
      />
    </ModalShell>
  );
}

function UnsuspendModal({ userId, userName, onClose, onDone }: {
  userId: string; userName: string; onClose: () => void; onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, start]  = useTransition();
  return (
    <ModalShell title="Unsuspend Account" onClose={onClose}>
      {error && <ErrMsg msg={error} />}
      <p className="mb-6 text-sm text-zinc-500">
        Restore full access to <strong className="text-zinc-800">{userName}</strong>&apos;s account immediately.
      </p>
      <BtnRow
        onCancel={onClose}
        onConfirm={() => start(async () => {
          const r = await unsuspendAccountAction(userId);
          if (r.error) { setError(r.error); return; }
          onDone();
        })}
        label="Unsuspend Account"
        cls="bg-emerald-600 hover:bg-emerald-700"
        pending={pending}
      />
    </ModalShell>
  );
}

function ResetPasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [tempPw, setTempPw]  = useState<string | null>(null);
  const [error, setError]    = useState("");
  const [pending, start]     = useTransition();
  const [copied, setCopied]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleReset() {
    start(async () => {
      const r = await resetPasswordAction(userId);
      if (r.error) { setError(r.error); return; }
      setTempPw(r.tempPassword ?? null);
    });
  }

  function copy() {
    if (!tempPw) return;
    navigator.clipboard.writeText(tempPw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ModalShell title="Reset Password" onClose={onClose}>
      {error && <ErrMsg msg={error} />}
      {tempPw ? (
        <>
          <p className="mb-3 text-sm text-zinc-500">Password reset successfully. Share this temporary password with the user — it will not be shown again.</p>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <input ref={inputRef} readOnly value={tempPw} className="flex-1 bg-transparent font-mono text-sm text-zinc-900 focus:outline-none" />
            <button onClick={copy} className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">Done</button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-zinc-500">
            This generates a secure temporary password and immediately replaces their current password. The user must change it on next login.
          </p>
          <BtnRow
            onCancel={onClose}
            onConfirm={handleReset}
            label="Generate & Reset"
            cls="bg-amber-600 hover:bg-amber-700"
            pending={pending}
          />
        </>
      )}
    </ModalShell>
  );
}

function DeleteModal({ userId, userName, onClose, onDone }: {
  userId: string; userName: string; onClose: () => void; onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [pending, start]      = useTransition();
  const valid = confirm === "DELETE";
  return (
    <ModalShell title="Delete Account" onClose={onClose}>
      {error && <ErrMsg msg={error} />}
      <p className="mb-3 text-sm text-zinc-500">
        Permanently deletes <strong className="text-zinc-800">{userName}</strong>&apos;s account and all associated events, photos, and gallery links.{" "}
        <strong className="text-red-600">This cannot be undone.</strong>
      </p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700">
          Type <code className="rounded bg-zinc-100 px-1 font-mono text-red-600">DELETE</code> to confirm
        </label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono placeholder-zinc-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>
      <BtnRow
        onCancel={onClose}
        onConfirm={() => {
          if (!valid) return;
          start(async () => {
            const r = await deleteAccountAction(userId);
            if (r.error) { setError(r.error); return; }
            onDone();
          });
        }}
        label="Delete Account"
        cls={valid ? "bg-red-600 hover:bg-red-700" : "bg-red-300 cursor-not-allowed"}
        pending={pending}
      />
    </ModalShell>
  );
}

// ─── Danger Zone ─────────────────────────────────────────────────────────────

type ModalType = "changePlan" | "suspend" | "unsuspend" | "resetPassword" | "delete" | null;

export function DangerZone({ userId, userName, isSuspended, currentPlan, planOptions }: {
  userId: string;
  userName: string;
  isSuspended: boolean;
  currentPlan: "FREE" | "PRO" | "STUDIO";
  planOptions: { value: "FREE" | "PRO" | "STUDIO"; label: string; desc: string }[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalType>(null);

  function onDone() {
    setModal(null);
    router.refresh();
  }

  function onDeleted() {
    setModal(null);
    router.push("/admin/photographers");
  }

  const actions: { label: string; desc: string; btnCls: string; modal: ModalType }[] = [
    {
      label: "Change Plan",
      desc: `Currently on the ${currentPlan} plan.`,
      btnCls: "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
      modal: "changePlan",
    },
    {
      label: isSuspended ? "Unsuspend Account" : "Suspend Account",
      desc: isSuspended
        ? "Re-enable this account and restore access."
        : "Immediately lock this account. The user cannot log in while suspended.",
      btnCls: isSuspended
        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
      modal: isSuspended ? "unsuspend" : "suspend",
    },
    {
      label: "Reset Password",
      desc: "Generate a temporary password and invalidate the current one.",
      btnCls: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
      modal: "resetPassword",
    },
    {
      label: "Delete Account",
      desc: "Permanently delete this account, all events, photos, and gallery links.",
      btnCls: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
      modal: "delete",
    },
  ];

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-100 bg-red-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-red-800">Danger Zone</h2>
          <p className="mt-0.5 text-xs text-red-500">Actions here are irreversible or have immediate effect.</p>
        </div>
        <div className="divide-y divide-zinc-100">
          {actions.map((a) => (
            <div key={a.label} className="flex items-center justify-between gap-6 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-zinc-800">{a.label}</p>
                <p className="text-xs text-zinc-400">{a.desc}</p>
              </div>
              <button
                onClick={() => setModal(a.modal)}
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${a.btnCls}`}
              >
                {a.label}
              </button>
            </div>
          ))}
        </div>
      </section>

      {modal === "changePlan" && (
        <ChangePlanModal userId={userId} currentPlan={currentPlan} planOptions={planOptions} onClose={() => setModal(null)} onDone={onDone} />
      )}
      {modal === "suspend" && (
        <SuspendModal userId={userId} userName={userName} onClose={() => setModal(null)} onDone={onDone} />
      )}
      {modal === "unsuspend" && (
        <UnsuspendModal userId={userId} userName={userName} onClose={() => setModal(null)} onDone={onDone} />
      )}
      {modal === "resetPassword" && (
        <ResetPasswordModal userId={userId} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && (
        <DeleteModal userId={userId} userName={userName} onClose={() => setModal(null)} onDone={onDeleted} />
      )}
    </>
  );
}
