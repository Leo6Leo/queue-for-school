const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface BuildOtpEmailInput {
  code: string;
  email: string;
  role: 'student' | 'ta';
  expiresInMinutes: number;
}

export const buildOtpEmail = (input: BuildOtpEmailInput) => {
  const roleLabel = input.role === 'ta' ? 'TA' : 'Student';
  const escapedEmail = escapeHtml(input.email);
  const escapedCode = escapeHtml(input.code);

  return {
    subject: `Your Queue login code: ${input.code}`,
    text: [
      `Queue login for ${escapedEmail}`,
      '',
      `Role: ${roleLabel}`,
      `Code: ${input.code}`,
      `Expires in ${input.expiresInMinutes} minutes.`,
      '',
      'If you did not request this code, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:32px 16px;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;overflow:hidden;">
          <div style="padding:28px 28px 18px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">UofT Queue Login</div>
            <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;">Your sign-in code</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Use this code to finish signing in as <strong>${roleLabel}</strong>.</p>
            <div style="margin:20px 0;padding:18px;border-radius:16px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
              <div style="font-size:34px;font-weight:700;letter-spacing:0.3em;color:#1d4ed8;">${escapedCode}</div>
            </div>
            <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">This code expires in ${input.expiresInMinutes} minutes.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">Requested for ${escapedEmail}. If this was not you, ignore this email.</p>
          </div>
        </div>
      </div>
    `,
  };
};
