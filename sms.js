const accountSid = 'AC6dfce92e834de940603d6198ca181c71';
const authToken = '381c31be89ecdb3048c3689b71e33012';
const client = require('twilio')(accountSid, authToken);


module.exports = {
    sendSms: (to, text) => {

        client.messages
            .create({
                body: text,
                from: '+12566935735',
                to: to
            })
            .then(message =>{
                console.log(message.sid)
                console.log(`Message Sent to ${to}`)
            });
    }
}