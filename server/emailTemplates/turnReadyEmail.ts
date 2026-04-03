const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface BuildTurnReadyEmailInput {
  studentName: string;
  courseName: string;
  roomName: string;
  queueType: 'marking' | 'question';
  actionUrl?: string | null;
}

export const buildTurnReadyEmail = (input: BuildTurnReadyEmailInput) => {
  const queueLabel = input.queueType === 'marking' ? 'Marking queue' : 'Question queue';
  const escapedName = escapeHtml(input.studentName);
  const escapedCourse = escapeHtml(input.courseName);
  const escapedRoom = escapeHtml(input.roomName);
  const actionUrl = input.actionUrl ? escapeHtml(input.actionUrl) : null;

  return {
    subject: `It's your turn in ${escapedCourse}`,
    text: [
      `Hi ${input.studentName},`,
      '',
      `It's your turn in the ${queueLabel.toLowerCase()} for ${input.courseName}.`,
      `Room: ${input.roomName}`,
      '',
      actionUrl ? `Open queue: ${input.actionUrl}` : '',
      'Please head back now.',
    ].filter(Boolean).join('\n'),
    html: `
      <div style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;overflow:hidden;">
          <div style="padding:30px;background:linear-gradient(135deg,#0f766e,#2563eb);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Queue Notification</div>
            <h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;">It's your turn</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${escapedName}, your spot is up in the <strong>${queueLabel}</strong>.</p>
            <div style="padding:18px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Course</p>
              <p style="margin:0 0 14px;font-size:20px;font-weight:700;">${escapedCourse}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Room</p>
              <p style="margin:0;font-size:18px;font-weight:700;">${escapedRoom}</p>
            </div>
            <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#334155;">Please head back to the queue now so the TA can start with you.</p>
            ${actionUrl ? `
              <div style="margin-top:24px;">
                <a href="${actionUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;">Open queue</a>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `,
  };
};
