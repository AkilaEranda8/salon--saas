FROM nginx:alpine

# Copy built static files
COPY . /usr/share/nginx/html

# Nginx config: static marketing site + explicit legal pages
RUN printf 'server {\n\
    listen 80;\n\
    charset utf-8;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    \n\
    location = /privacy { try_files /privacy.html =404; }\n\
    location = /privacy-policy { try_files /privacy.html =404; }\n\
    location = /terms { try_files /terms.html =404; }\n\
    location = /terms-of-service { try_files /terms.html =404; }\n\
    \n\
    location / {\n\
    try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
    }\n\
    \n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n\
    gzip_min_length 1000;\n\
    }\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
