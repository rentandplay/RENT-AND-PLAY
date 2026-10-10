import nodemailer from 'nodemailer';

export function createAccountMailer() {
  let transporter;
  return async ({ email, fullName, role, password }) => {
    const user = String(process.env.SMTP_USER || '').trim(), pass = String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
    if (!user || !pass) throw Object.assign(new Error('Account email delivery is not configured. Use a manual temporary password or ask the owner to configure SMTP.'), { status: 503 });
    transporter ||= nodemailer.createTransport({ service: 'gmail', auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    try {
      const delivery = await transporter.sendMail({
        from: `Rent & Play <${user}>`, to: email, subject: 'Your Rent & Play staff account',
        text: `Hello ${fullName},\n\nYour ${role === 'OWNER' ? 'Owner' : 'Operator'} account is ready.\n\nEmail: ${email}\nTemporary password: ${password}\n\nSign in to the Rent & Play staff workspace using your usual website address or mobile app. You must choose a new password before accessing the workspace. Your new password needs at least 8 characters, one capital letter, and one number.\n\nKeep this temporary password private.\n\nRent & Play`
      });
      if (!delivery.accepted?.length || delivery.rejected?.length) throw new Error('Email rejected');
    } catch { throw Object.assign(new Error('The temporary-password email could not be sent. The account was not created. Check the email address or use manual mode.'), { status: 503 }); }
  };
}
