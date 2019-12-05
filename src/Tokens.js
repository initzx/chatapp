const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator();

const tokens = [];
const socketHandlers = [];

let getUserFromToken = (token) => {
    return tokens[token];
};

let getSocketHandler = (userId) => {
    return socketHandlers[userId];
};

let addUser = (userId, socketHandler, cb) => {
    uidgen.generate().then(token => {
        setUserSocketHandler(userId, socketHandler);
        setUserToken(userId, token);
       cb(token);
    });
};

let removeSocketHandler = (userId, socketHandler) => {
    socketHandlers[userId] = socketHandlers[userId].filter(s => s !== socketHandler);
};


let setUserSocketHandler = (userId, socketHandler) => {
    if(!socketHandlers[userId]) {
        socketHandlers[userId] = [socketHandler];
        return;
    }
    socketHandlers[userId].push(socketHandler);
};

let setUserToken = (userId, token) => {
    tokens[token] = userId;
};

module.exports = {getUserFromToken, getSocketHandler, addUser, setUserToken, setUserSocketHandler, removeSocketHandler};
