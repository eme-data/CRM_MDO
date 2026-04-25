export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'redis',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN,
  contract: {
    alertDays: (process.env.CONTRACT_ALERT_DAYS ?? '90,60,30,7')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n)),
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? 'no-reply@mdoservices.fr',
    secure: process.env.SMTP_SECURE === 'true',
  },
  inbound: {
    enabled: process.env.INBOUND_EMAIL_ENABLED ?? 'false',
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT ?? '993',
    secure: process.env.IMAP_SECURE ?? 'true',
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    folder: process.env.IMAP_FOLDER ?? 'INBOX',
    processedFolder: process.env.IMAP_PROCESSED_FOLDER,
  },
});
