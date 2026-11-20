# ===================================================
# my-silo 生产极简 Dockerfile (直接打包本地预编译的 Linux 纯静态二进制)
# ===================================================

FROM alpine:3.19

# 替换为国内阿里云 apk 软件源加速下载基础依赖
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache ca-certificates tzdata

WORKDIR /app

# 复制本地预编译好且已内嵌前端界面的 Linux 纯静态二进制文件
COPY deploy/bin/my-silo /app/my-silo
RUN chmod +x /app/my-silo

ENV TZ=Asia/Shanghai \
    SILO_PORT=8989 \
    SILO_DATA_DIR=/data \
    SILO_ADMIN_USER=admin \
    SILO_ADMIN_PASSWORD=admin123 \
    SILO_MAX_SIZE_MB=500

EXPOSE 8989
VOLUME ["/data"]

ENTRYPOINT ["/app/my-silo"]
