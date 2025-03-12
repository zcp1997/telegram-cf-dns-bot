FROM node:18-alpine

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
