"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";

const OPEN_CONTACT_FORM = "open-contact-form";
type Status = "idle" | "sending" | "sent" | "error";

export function ContactButton({ children, className = "button", source }: { children: React.ReactNode; className?: string; source: string }) {
  return <button className={`${className} contact-trigger`} type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CONTACT_FORM, { detail: source }))}>{children}</button>;
}

export function ContactDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [source, setSource] = useState("Website contact");
  const titleId = useId();

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setSource(detail || "Website contact");
      setStatus("idle");
      setError("");
      dialogRef.current?.showModal();
    };
    window.addEventListener(OPEN_CONTACT_FORM, open);
    return () => window.removeEventListener(OPEN_CONTACT_FORM, open);
  }, []);

  function close() {
    dialogRef.current?.close();
    setStatus("idle");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const form = event.currentTarget;
    const payload = { ...Object.fromEntries(new FormData(form).entries()), source };

    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "We could not send your request.");
      form.reset();
      setStatus("sent");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not send your request.");
      setStatus("error");
    }
  }

  return <dialog className="contact-dialog" ref={dialogRef} aria-labelledby={titleId} onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="contact-dialog-card">
      <button className="dialog-close" type="button" aria-label="Close contact form" onClick={close}>×</button>
      {status === "sent" ? <div className="form-success" role="status"><div className="eyebrow">REQUEST RECEIVED</div><h2>Thank you. We’ll be in touch.</h2><p>Your details were delivered to our security team.</p><button className="button" type="button" onClick={close}>Done</button></div> :
        <form onSubmit={submit}><div className="eyebrow">CONTACT MCPSECURITY.CLOUD</div><h2 id={titleId}>Let’s talk about your MCP security.</h2><p>Tell us who you are. Add a message if there is useful context.</p><div className="contact-form-grid">
          <label>Full name<input name="name" autoComplete="name" required maxLength={120}/></label>
          <label>Work email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
          <label className="form-wide">Company<input name="company" autoComplete="organization" required maxLength={160}/></label>
          <label className="form-wide">Message <span>(optional)</span><textarea name="message" maxLength={3000} rows={5} placeholder="What would you like to discuss?"/></label>
          <label className="contact-honeypot" aria-hidden="true">Leave blank<input name="website" tabIndex={-1} autoComplete="off"/></label>
        </div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button className="button" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send details →"}</button><span>We’ll use these details only to contact you about your request.</span></div></form>}
    </div>
  </dialog>;
}
