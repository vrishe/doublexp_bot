# sudo docker build --no-cache -t doublexp_bot .
# sudo docker run -d --name='doublexp_bot' -e "BOT_TOKEN=BOT TOKEN HERE" -v .docker/volumes/doublexp_bot:/app/data doublexp_bot
# sudo docker exec -it doublexp_bot git pull

FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y wget && \
    apt-get install -y ca-certificates && \
    apt-get install -y git && \
    apt-get install -y npm

WORKDIR /app
RUN git clone https://vrishe:093ea934-a411-4b0a-b187-b2b5cb9233f5@gitflic.ru/project/vrishe/doublexp_bot.git ./

WORKDIR /app/doublexp_bot
RUN npm install

ENV DATA_DIR=/app/data
CMD [ "npm", "run", "start" ]
