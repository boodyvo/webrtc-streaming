const express = require("express");
const app = express();
const path = require("path");
const router = express.Router();
const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const privateKey = fs.readFileSync("keys/file.pem");
const certificate = fs.readFileSync("keys/file.crt");

const port = process.env.port || 3000;

app.use(express.static("public"));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

router.get("/",function(req,res){
    res.sendFile(path.join(__dirname+"/public/index.html"));
});

router.get("/join",function(req,res){
    res.sendFile(path.join(__dirname+"/public/join.html"));
});

router.get("/room",function(req,res){
    res.sendFile(path.join(__dirname+"/public/room.html"));
});

//add the router
app.use("/", router);
// app.listen(port);
console.log(`Running at port ${port}`);

let server = https.createServer({
    key: privateKey,
    cert: certificate
}, app);
const io = require("socket.io")(server);

collection = {};
let ownerId = null;

function socketCount() {
    let count = 0;

    for(var prop in io.sockets.connected) {
        if (io.sockets.connected.hasOwnProperty(prop))
            ++count;
    }

    return count;
}

io.on("connection", (socket) => {
    socket.pubKey = 0;
    socket.msg = crypto.randomBytes(256);
    socket.auth = false;
    // console.log("Connected socket", io.sockets.connected);
    socket.on("message", (message) => {
        // console.log(`Got message from ${socket.owner ? "owner" : "user"}:`, message);
        if (message.action) {
            switch (message.action) {
                case "init":
                    collection[message.data.identity_pubkey] = socket.id;
                    socket.pubKey = message.data.identity_pubkey;
                    if (socket.pubKey === "0212e026ad9fd1fe861d09a7c3f73917c2c288bbf146059e435c9e7397ac47116f") {
                        socket.owner = true;
                        ownerId = socket.id;
                    }
                    else {
                        socket.owner = false;
                    }
                    socket.send({
                        action: "sign_message_request",
                        data: {
                            msg: socket.msg.toString("hex")
                        }
                    });
                    break;
                case "sign_message_response":
                    // ToDo: add check
                    socket.auth = true;
                    socket.send({
                        action: "authorized",
                        data: {
                            owner: socket.owner,
                        }
                    });
                    break;
                case "offer":
                    if (socket.owner)
                        break;
                    const ownerSocket = io.sockets.connected[ownerId];
                    if (ownerSocket) {
                        ownerSocket.send({
                            action: "offer",
                            data: {
                                description: message.data.description,
                                identity_pubkey: socket.pubKey,
                            }
                        });
                    }
                    break;
                case "offer_response":
                    const respSocket = io.sockets.connected[collection[message.data.identity_pubkey]];
                    respSocket.send({
                        action: "offer_response",
                        data: {
                            description: message.data.description,
                            identity_pubkey: socket.pubKey,
                        }
                    });
                    break;
                case "candidate":
                    console.log("Got candidate", socket.id);
                    socket.broadcast.emit("message", {
                        action: "candidate",
                        data: message.data
                    });
                    break;
                default:
                    console.log("Unknown action");
            }
        }
        else {
            console.log("Unknown message");
        }
    });
    console.log("A user is connected", socket.id, socket.msg.toString("hex"));
    // console.log("Sockets", io.sockets.connected[socket.id]);

});

server.listen(port, "0.0.0.0", () => {
    console.log('server is running on port', server.address().port);
});
