const socket = io({secure: true});
socket.on("connect", async function() {
    const info = await webln.getInfo();
    console.log(info.data.identity_pubkey);
    socket.send({
        action: "init",
        data: {
            identity_pubkey: info.data.identity_pubkey
        }
    });
});

let answerDescription;
let receiveChannel;
let shouldPay = false;

const video = document.getElementById("video");
const balance = document.getElementById("balance");
async function setBalance() {
    const walletBalance = await webln.walletBalance();
    balance.innerHTML = `Balance: ${walletBalance.data.balance} Satoshis`;
}
setInterval(setBalance, 2000);
const configuration = {
    iceServers: [{
        urls: 'stun:stun3.l.google.com:19302' // Google's public STUN server
    }]
};
const pc = new RTCPeerConnection(configuration);
// const pc = new RTCPeerConnection();


video.onloadedmetadata = function() {
    video.play();
};

function receiveChannelCallback(event) {
    console.log('Receive Channel Callback', event);
    receiveChannel = event.channel;
    receiveChannel.onmessage = onReceiveMessageCallback;
}

async function onReceiveMessageCallback(event) {
    console.log('Received Message', event);
    const msg = JSON.parse(event.data);
    console.log("Parsed message", msg);
    if (msg.action === "request_payment") {
        console.log("Will pay", msg.data.payment_request);
        await payInvoice(msg.data.payment_request);
    }
}

pc.ontrack = (event) => {
    console.log("Remote track event", event);
    shouldPay = true;
    if (video.srcObject)
        return;
    video.srcObject = event.streams[0];
};

pc.onicecandidate = event => {
    if (event.candidate) {
        socket.send({
            action: "candidate",
            data: {
                candidate: event.candidate,
            }
        });
        // console.log("Got candidate message", event.candidate);
    }
};

socket.on("message", async function(message) {
    // console.log("Got message", message);
    if (message.action) {
        switch (message.action) {
            case "sign_message_request":
                const signature = await webln.signMessage(message.data.msg);
                socket.send({
                    action: "sign_message_response",
                    data: {
                        signature: signature.data.signature
                    }
                });
                break;
            case "authorized":
                break;
            case "offer":
                pc.setRemoteDescription(message.data.description);
                answerDescription = await pc.createAnswer();
                await onCreateAnswerSuccess(answerDescription, message);
                pc.ondatachannel = receiveChannelCallback;
                break;
            case "candidate":
                try {
                    await pc.addIceCandidate(message.data.candidate);
                    console.log("Connected candidate");
                } catch (error) {
                }
                break;
            default:
                console.log("Unknown action");
        }
    }
});

async function onCreateAnswerSuccess(description, message) {
    // console.log(`Answer from remote:\n${description.sdp}`);
    try {
        await pc.setLocalDescription(description);
    } catch (e) {
        console.error(e);
    }

    try {
        socket.send({
            action: "offer_response",
            data: {
                identity_pubkey: message.data.identity_pubkey,
                description,
            }
        });
    } catch (e) {
        onSetSessionDescriptionError(e);
    }
}

async function payInvoice(paymentInvoice) {
    if (video.paused) {
        console.log("Will not pay invoice");
        return;
    }
    console.log("Will pay invoice");
    try {
        await webln.sendPayment(paymentInvoice);
    } catch(error) {
        payInvoice(paymentInvoice);
    }
}

console.log(shouldPay);
