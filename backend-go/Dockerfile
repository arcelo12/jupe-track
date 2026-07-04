FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download || true
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -tags netgo -a -installsuffix cgo -o /app/server cmd/server/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server /app/server
EXPOSE 8080
CMD ["/app/server"]
