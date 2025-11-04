# sudo docker build --no-cache -t doublexp_bot .
# sudo docker run -d --name='doublexp_bot' -e "BOT_TOKEN=BOT TOKEN HERE" doublexp_bot
# sudo docker exec -it doublexp_bot git pull

FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y wget && \
    apt-get install -y ca-certificates && \
    apt-get install -y git && \
    apt-get install -y npm

WORKDIR /app
RUN git clone --no-checkout https://vrishe:089eca1a-757e-4449-a45d-a5b3c83a8ae2@gitflic.ru/project/vrishe/doublexp_bot.git ./
RUN git sparse-checkout init --cone
RUN git sparse-checkout set doublexp_bot
RUN git checkout

WORKDIR /app/doublexp_bot
RUN npm install

ENV DATA_DIR=/app/data
CMD npm run start
