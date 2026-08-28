const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RECIPIENT = "idoabramovitz@gmail.com";
const SENDER = "mcpSecurity.cloud <leads@mcpsecurity.cloud>";

type ContactRequest = { name?: unknown; email?: unknown; company?: unknown; message?: unknown; website?: unknown; source?: unknown };

export async function POST(request: Request) {
  let body: ContactRequest;
  try { body = (await request.json()) as ContactRequest; }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  if (text(body.website)) return Response.json({ ok: true });
  const name = text(body.name, 120);
  const email = text(body.email, 254).toLowerCase();
  const company = text(body.company, 160);
  const message = text(body.message, 3000);
  const source = text(body.source, 160) || "Website contact";
  if (!name || !validEmail(email) || !company) return Response.json({ error: "Please complete all required fields." }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Contact form is missing RESEND_API_KEY");
    return Response.json({ error: "Email delivery is temporarily unavailable." }, { status: 503 });
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: SENDER,
      to: [RECIPIENT],
      reply_to: email,
      subject: `Website contact: ${company}`,
      text: [`Name: ${name}`, `Email: ${email}`, `Company: ${company}`, `Source: ${source}`, "", "Message:", message || "No message provided."].join("\n"),
    }),
  });
  if (!response.ok) {
    console.error("Resend rejected contact email", response.status, await response.text());
    return Response.json({ error: "We could not send your details. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}

function text(value: unknown, maxLength = 200): string { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
