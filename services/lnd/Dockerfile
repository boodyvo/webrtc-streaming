FROM lightningnetwork/golang-alpine:latest

RUN apk --no-cache add git openssl ca-certificates gcc musl-dev
RUN go get -v github.com/golang/dep/cmd/dep

RUN mkdir /macaroons
RUN mkdir /rpc

RUN go get -d github.com/lightningnetwork/lnd
WORKDIR /go/src/github.com/lightningnetwork/lnd

RUN make && make install

COPY files/lnd.conf /root/.lnd/lnd.default.conf
COPY files/docker-entrypoint.sh /docker-entrypoint.sh
COPY files/unlock.sh /unlock.sh

ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["lnd", "--configfile=/root/.lnd/lnd.default.conf"]
