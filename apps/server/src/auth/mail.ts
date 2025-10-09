import { validateEnv } from '@shared/env';

const env = validateEnv(process.env);

export async function sendMagicLink(
  email: string,
  token: string,
  redirectUrl: string
): Promise<void> {
  const magicUrl = `${redirectUrl}?token=${token}`;

  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Spotlight Trader <auth@spotlighttrader.com>',
        to: email,
        subject: 'Sign in to Spotlight Trader',
        html: `
          <h1>Sign in to Spotlight Trader</h1>
          <p>Click the link below to sign in to your account:</p>
          <p><a href="${magicUrl}">${magicUrl}</a></p>
          <p>This link expires in 15 minutes.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email via Resend: ${error}`);
    }

    console.log(`✅ Magic link sent to ${email} via Resend`);
  } else {
    console.log('\n🔗 MAGIC LINK (dev mode - no email service configured):');
    console.log(`   Email: ${email}`);
    console.log(`   URL: ${magicUrl}`);
    console.log('');
  }
}
