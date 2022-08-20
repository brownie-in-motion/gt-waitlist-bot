FROM node:18

COPY package.json yarn.lock /app/
WORKDIR /app

RUN yarn

COPY . .

CMD ["node", "src/index.js"]
