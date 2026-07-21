FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -tags netgo -a -installsuffix cgo -o /app/server cmd/server/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -tags netgo -a -installsuffix cgo -o /app/apikey cmd/apikey/main.go

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache su-exec && \
    mkdir -p /app/data && \
    adduser -D -h /app appuser
COPY --from=builder /app/server /app/server
COPY --from=builder /app/apikey /app/apikey
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/app/server"]
