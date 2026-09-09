import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * 发送注册验证码邮件。
 * SMTP 未配置（dev）时把验证码打印到日志——【仅限开发环境】，生产必须配置 SMTP_*。
 */
export async function sendVerificationCodeEmail(email: string, code: string): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    console.warn(`[mailer] SMTP 未配置，dev 模式直接输出验证码：${email} -> ${code}`);
    return;
  }
  await tx.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: email,
    subject: "AIInfra Lab 注册验证码",
    text: `你的注册验证码是 ${code}，10 分钟内有效。如果不是本人操作请忽略本邮件。`,
  });
}
