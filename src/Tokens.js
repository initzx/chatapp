const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator();

const tokens = {};
const sockets = {};

let getUserFromToken = (token) => {
    return tokens.get(token);
};

let getSocket = (userId) => {
    return sockets.get(userId);
};

let addUser = (userId, socket, cb) => {
    uidgen.generate().then(token => {
       sockets[userId] = socket;
       tokens[token] = userId;
       cb(token);
    });
};

module.exports = {getUserFromToken, getSocket, addUser};
