import { render, toPlainText } from '@react-email/render';
import { z } from 'zod';
export const otpMailSchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/),
    purpose: z.enum(['signup_verify', 'password_reset', 'email_change']),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type OtpMail = z.infer<typeof otpMailSchema>;
function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
      </head>
      <body>
        <header>
          <h1>Twin Cities Hostels</h1>
        </header>
        <main>{children}</main>
        <footer>Islamabad and Rawalpindi · Keep your account secure.</footer>
      </body>
    </html>
  );
}
export async function otpEmail(input: OtpMail) {
  const mail = otpMailSchema.parse(input);
  const title = mail.purpose === 'password_reset' ? 'Reset your password' : 'Verify your email';
  const html = await render(
    <Layout title={title}>
      <h2>{title}</h2>
      <p>
        Your verification code is <strong>{mail.code}</strong>.
      </p>
      <p>This code expires in ten minutes. Never share it with anyone.</p>
      <p>If you did not request this email, you can ignore it.</p>
    </Layout>,
  );
  return { subject: title, html, text: toPlainText(html) };
}
export async function managerWelcomeEmail(name: string) {
  const recipient = z.string().trim().min(1).max(200).parse(name);
  const subject = 'Your manager invitation';
  const html = await render(
    <Layout title={subject}>
      <h2>Welcome, {recipient}</h2>
      <p>Your hostel owner has invited you as a manager.</p>
      <p>Ask your owner for your temporary password, then activate your account.</p>
      <p>Never share your permanent password.</p>
    </Layout>,
  );
  return { subject, html, text: toPlainText(html) };
}
