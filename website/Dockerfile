FROM nginx:alpine

# Copy built static files
COPY . /usr/share/nginx/html

# Nginx config: serve SPA with proper React Router support
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    \n\
    # React Router - all routes serve index.html\n\
    location / {\n\
    try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    # Cache static assets 1 year\n\
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
