FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY server ./server
ENV MODE=online PORT=7860
EXPOSE 7860
CMD ["node", "server/index.js"]
