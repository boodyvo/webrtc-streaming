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
const offerOptions = {
    offerToReceiveVideo: 1
};

let isOwner = null;
let offerDescription;
let sendChannel;

const video = document.getElementById("video");
const balance = document.getElementById("balance");
async function setBalance() {
    const walletBalance = await webln.walletBalance();
    balance.innerHTML = `Balance: ${walletBalance.data.balance} Satoshis`;
}
setInterval(setBalance, 200);
const configuration = {
    iceServers: [{
        urls: 'stun:stun3.l.google.com:19302' // Google's public STUN server
    }]
};
const pc = new RTCPeerConnection(configuration);
// const pc = new RTCPeerConnection();
let stream;
const constraints = window.constraints = {
    audio: false,
    video: true
};


async function init() {
    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.stream = stream; // make variable available to browser console
        video.srcObject = stream;
        stream.getTracks().forEach(track => {
            console.log("tracking", track);
            remote = pc.addTrack(track, stream);
        });
        sendChannel = pc.createDataChannel("sendDataChannel");
        console.log("Open channel", sendChannel);
        sendChannel.onopen = async () => {
            const readyState = sendChannel.readyState;
            console.log('Send channel state is: ' + readyState);
            if (readyState === 'open') {
                await requestPayment();
            }
        };
        video.play();
    } catch (error) {
        console.log(error);
    }
}

pc.onicecandidate = event => {
    console.log("Will send candidate");
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

let remote = null;

socket.on("message", async function(message) {
    console.log("Got message", message);
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
                offerDescription = await pc.createOffer(offerOptions);
                await onCreateOfferSuccess(offerDescription);
                break;
            case "offer_response":
                await pc.setRemoteDescription(message.data.description);

                break;
            case "candidate":
                console.log("Got candidate", message.data);
                await pc.addIceCandidate(message.data.candidate);
                break;
            default:
                console.log("Unknown action");
        }
    }
});

async function onCreateOfferSuccess(description) {
    // console.log(`Offer from pc\n${description.sdp}`);
    try {
        await pc.setLocalDescription(description);
    } catch (e) {
        console.error(e);
    }

    try {
        socket.send({
            action: "offer",
            data: {
                description,
            }
        });
    } catch (e) {
        console.error(e);
    }
}

async function isPayed(rHash) {
    let status = await webln.checkInvoice(base64toHEX(rHash));
    console.log("Checking invoice", status);
    return status.data.state === "SETTLED";
}

let lastInvoice = null;
const DELAY = 1000;
let count = 0;

async function checkLastInvoice() {
    const status = await isPayed(lastInvoice.r_hash);
    console.log("Check last invoice status", status);
    if (!status) {
        if (remote && count > 0) {
            pc.removeTrack(remote);
            remote = null;
        }
        ++count;
        sendChannel.send(JSON.stringify({
            action: "request_payment",
            data: {
                payment_request: lastInvoice.payment_request
            }
        }));
        setTimeout(checkLastInvoice, DELAY);
    } else {
        if (!remote) {
            stream.getTracks().forEach(track => {
                console.log("tracking", track);
                remote = pc.addTrack(track, stream);
            });
        }
        await requestPayment();
    }
}

async function requestPayment() {
    count = 0;
    let invoice = await webln.makeInvoice(10);
    lastInvoice = invoice.data;
    console.log("Last invoice", lastInvoice);
    sendChannel.send(JSON.stringify({
        action: "request_payment",
        data: {
            payment_request: lastInvoice.payment_request
        }
    }));
    setTimeout(checkLastInvoice, DELAY);
}

function base64toHEX(base64) {
    let raw = atob(base64);
    let HEX = '';

    for (let i = 0; i < raw.length; i++ ) {
        let _hex = raw.charCodeAt(i).toString(16);
        HEX += (_hex.length === 2?_hex:'0'+_hex);
    }
    return HEX.toLowerCase();
}

$(window).on("load", function() {
    init();
});

