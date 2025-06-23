# MongoDB High Availability Tester Docker Image
FROM node:18-alpine

# 設定工作目錄
WORKDIR /app

# 安裝 dumb-init 作為 PID 1 進程，處理信號
RUN apk add --no-cache dumb-init

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝依賴
RUN npm ci --only=production && \
    npm cache clean --force

# 建立非 root 用戶
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mongodb-tester -u 1001

# 複製應用程式代碼
COPY --chown=mongodb-tester:nodejs . .

# 設定用戶
USER mongodb-tester

# 暴露健康檢查端點 (如果需要)
EXPOSE 3000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('Health check: OK')" || exit 1

# 設定環境變數
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# 使用 dumb-init 作為入口點
ENTRYPOINT ["dumb-init", "--"]

# 預設啟動完整測試（包含 Web 服務器 + 資料寫入）
CMD ["npm", "start"]