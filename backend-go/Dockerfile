FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/apikey ./cmd/apikey

FROM alpine:3.22

WORKDIR /app

RUN apk add --no-cache ca-certificates su-exec tzdata && \
	adduser -D -h /app -s /sbin/nologin appuser && \
	mkdir -p /app/data && \
	chown -R appuser:appuser /app

COPY --from=builder /out/server /app/server
COPY --from=builder /out/apikey /app/apikey
COPY --chmod=755 entrypoint.sh /app/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/app/server"]
