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
let answerDescription;
let offerDescription;
let sendChannel;
let receiveChannel;

const video = document.getElementById("video");
const balance = document.getElementById("balance");
async function setBalance() {
    const walletBalance = await webln.walletBalance();
    balance.innerHTML = walletBalance.data.balance;
}
setInterval(setBalance, 2000);
const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302' // Google's public STUN server
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
      if (!isOwner) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          window.stream = stream; // make variable available to browser console
          video.srcObject = stream;
          stream.getTracks().forEach(track => {
              console.log("tracking", track);
              pc.addTrack(track, stream)
          });
          video.play();
      }
  } catch (error) {
      console.log(error);
  }
}

$("#startButton").on("click", init);

video.onloadedmetadata = function() {
    video.play();
    console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
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
                isOwner = message.data.owner;
                console.log("IsOwner", isOwner);
                if (!isOwner) {
                    offerDescription = await pc.createOffer(offerOptions);
                    await onCreateOfferSuccess(offerDescription);
                }
                break;
            case "offer":
                pc.setRemoteDescription(message.data.description);
                answerDescription = await pc.createAnswer();
                await onCreateAnswerSuccess(answerDescription, message);

                pc.ondatachannel = receiveChannelCallback;
                // const stream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            case "offer_response":
                await pc.setRemoteDescription(message.data.description);

                sendChannel = pc.createDataChannel("sendDataChannel");
                console.log("Open channel", sendChannel);
                sendChannel.onopen = async () => {
                    const readyState = sendChannel.readyState;
                    console.log('Send channel state is: ' + readyState);
                    if (readyState === 'open') {
                        await requestPayment();
                    }
                };

                if (stream) {
                    stream.getTracks().forEach(track => {
                        console.log("tracking", track);
                        remote = pc.addTrack(track, stream)
                    });
                }
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
    console.log(`Offer from pc\n${description.sdp}`);
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

async function onCreateAnswerSuccess(description, message) {
    console.log(`Answer from remote:\n${description.sdp}`);
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

async function isPayed(rHash) {
    let status = await webln.checkInvoice(base64toHEX(rHash));
    if (status.settled) {
        return true;
    }
    return false;
}

let lastInvoice = null;

async function checkLastInvoice() {
    const status = await isPayed(lastInvoice.r_hash);
    console.log("Check last invoice status", status);
    if (!status) {
        if (remote) {
            pc.removeTrack(remote);
            remote = null;
        }
        setTimeout(checkLastInvoice, 5000);
    } else {
        stream.getTracks().forEach(track => {
            console.log("tracking", track);
            remote = pc.addTrack(track, stream);
        });
        requestPayment();
    }
}

async function requestPayment() {
    let invoice = await webln.makeInvoice(10);
    lastInvoice = invoice.data;
    console.log("Last invoice", lastInvoice);
    sendChannel.send(JSON.stringify({
        action: "request_payment",
        data: {
            payment_request: lastInvoice.payment_request
        }
    }));
    setTimeout(checkLastInvoice, 5000);
}

async function payInvoice(paymentRequest) {
    console.log("Will pay invoice", paymentRequest);
    await webln.sendPayment(paymentRequest);
    console.log("Payed invoice");
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

