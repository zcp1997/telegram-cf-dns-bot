FROM node:18-alpine
LABEL org.opencontainers.image.source="https://github.com/zcp1997/telegram-cf-dns-bot"

# optional:设置时区为亚洲/上海
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# 复制应用代码
COPY src/ /app/src/
COPY package*.json /app/

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 启动应用
CMD ["node", "src/index.js"]