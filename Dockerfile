# 诗画同源 · 静态小工具
# 构建产物已在仓库 dist/ 中，镜像只做静态托管
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

EXPOSE 80
