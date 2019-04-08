FROM lightningnetwork/golang-alpine:latest

# fetch dependencies
RUN apk update
RUN apk --no-cache add git jq gcc musl-dev
RUN go version
RUN git clone https://github.com/btcsuite/btcd /go/src/github.com/btcsuite/btcd

WORKDIR /go/src/github.com/btcsuite/btcd

RUN GO111MODULE=on go install -v . ./cmd/...

# clean up
RUN apk --no-cache del git gcc musl-dev

COPY files/btcd.conf /root/.btcd/btcd.default.conf
COPY files/docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["btcd", "--configfile=/root/.btcd/btcd.default.conf"]
