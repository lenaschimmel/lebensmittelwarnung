FROM node:14-buster

# Create app directory
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y imagemagick ghostscript poppler-utils cron openssl curl

# Copy crontab.txt file to the cron.d directory
COPY crontab.txt /etc/cron.d/crontab.txt
COPY *.sh /

# Give execution rights on the cron job
RUN chmod 0644 /etc/cron.d/crontab.txt
RUN chmod +x /run.sh

# Apply cron job
RUN crontab /etc/cron.d/crontab.txt

# Set time zone. Taken from https://serverfault.com/a/683651
ENV TZ=Europe/Berlin
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .
RUN touch /var/log/cron.log

CMD cron && tail -f /var/log/cron.log