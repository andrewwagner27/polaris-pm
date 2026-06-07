export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, html } = req.body;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Modus Property Management <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json({ error: data });
  }

  return res.status(200).json({ success: true, id: data.id });
}