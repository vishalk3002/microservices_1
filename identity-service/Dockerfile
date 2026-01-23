## use the official node.js 22 image with alpine linux as the base image
#  ✅ Node 22.x → current LTS
FROM node:22-alpine  

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]