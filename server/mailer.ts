import nodemailer from 'nodemailer';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? 'ECE Queue <no-reply@example.com>';

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : nodemailer.createTransport({
        jsonTransport: true,
      });

export const getMailerMode = (): 'smtp' | 'json' =>
  SMTP_HOST && SMTP_USER && SMTP_PASS ? 'smtp' : 'json';

export const sendEmail = async (input: SendEmailInput): Promise<void> => {
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  if (getMailerMode() === 'json') {
    console.log('[mailer] JSON transport output:', JSON.stringify(info, null, 2));
  }
};
