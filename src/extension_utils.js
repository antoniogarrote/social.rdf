exports.send_error = function(msg) {
    process.send({'msg':'error', 'text':msg});
};
