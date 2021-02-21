const express = require('express')
const { WebhookClient } = require('dialogflow-fulfillment')
const app = express()
const { SimpleResponse } = require('actions-on-google')
const stkPush = require('./stk_push');
const sms = require('./sms');
const chainHandler = require('./chain_request_handlers');
const request = require('request-promise');
const redis = require('redis');
const responseTime = require('response-time');
var uuid = require('node-uuid');

const client = redis.createClient({host: 'redis', port: 6379});

// Print redis errors to the console
client.on('error', (err) => {
    console.log("Error " + err);
});

app.use(responseTime());

app.get('/', (req, res) => res.send('This ia NodeJS Webhook!'))
app.post('/dialogflow', express.json(), (req, res) => {
    const agent = new WebhookClient({ request: req, response: res })
    var restart = false;

    function welcome(agent) {
        agent.add("Welcome To Eclectics Digital Banking");
    }

    function resetPhone(amount) {
        agent.context.set({
            'name': 'banker_transfer_funds_dialog_context', 'lifespan': 2,
            "parameters": {
                "phone": "",
                "phone.original": "",
                "amount": amount,
                "amount.original": String(amount)
            }
        });
        agent.context.set({
            'name': '76cb8e65-71d7-4a07-b2bd-a1ca10bb96bf_id_dialog_context', 'lifespan': 2,
            "parameters": {
                "phone": "",
                "phone.original": "",
                "amount": amount,
                "amount.original": String(amount)
            }
        });
        agent.context.set({
            'name': 'banker_transfer_funds_dialog_params_phone', 'lifespan': 1,
            "parameters": {
                "phone": "",
                "phone.original": "",
                "amount": amount,
                "amount.original": String(amount)
            }
        });
        agent.context.delete('banker_transfer_funds_dialog_params_amount')
        agent.context.set({
            'name': '__system_counters__', 'lifespan': 1,
            "parameters": {
                "no-input": 0,
                "no-match": 0,
                "phone": "",
                "phone.original": "",
                "amount": amount,
                "amount.original": String(amount)
            }
        });
    }

    function prepareFundsTransfer() {
        let accountno = agent.parameters.phone;
        let amount = agent.parameters.amount;
        let send_request = {};
        if (accountno != '') {
            send_request = stkPush.prepareSTKPush(accountno, amount, agent);
        }
        if (accountno != '' && amount != '') {
            if (send_request.status) {
                var transactionId = `ECL_2.0_${uuid.v4()}`;
                agent.add(`About to send KES ${amount}, from Mobile Accountno ${accountno}. Do you approve?`);
                agent.context.set({
                    'name': 'current_transaction', 'lifespan': 10, 'parameters':
                        { 'transactionId': transactionId, 'amount': amount, 'accountno': accountno }
                });
                agent.context.set({ 'name': 'prep-payment', 'lifespan': 3, 'parameters': { 'amount': amount, 'accountno': accountno } });
            } else {
                //reset phone parameter, for dialogflow to reprompt
                resetPhone(amount);
                //set reprompt text
                agent.add(`Try to enter it again(07𝒙𝒙𝒙𝒙𝒙𝒙𝒙𝒙𝒙)`);
            }
        } else if (accountno != '' && amount == '') {
            if (send_request.status) {
                agent.add(`And how much would you like to transfer?`);
            } else {
                //reset phone parameter, for dialogflow to reprompt
                resetPhone(amount);
                //set reprompt text
                agent.add(`Try to enter it again(07𝒙𝒙𝒙𝒙𝒙𝒙𝒙𝒙𝒙)`);
            }
        } else if (accountno == '' && amount != '') {
            agent.add(`What is the the Mobile number you would like to transfer KES ${amount} from`);
        } else {
            agent.add(`Kindly enter the Mobile number you would like to transfer funds from`);
        }
    }

    function restartPayment() {
        restart = true;
        startPayment();
        agent.add(` Mobile Money pin prompt sent to ${accountno}! Kindly confirm`);
        agent.add(`Was the prompt recieved?`);
    }
    function startPayment() {
        let accountno = agent.parameters.accountno;
        let amount = agent.parameters.amount;
        let transactionId = agent.context.get('current_transaction').parameters.transactionId;
        if (restart) transactionId = `ECL_2.0_${uuid.v4()}`;
        if (accountno == '' || accountno == null) accountno = agent.context.get('current_transaction').parameters.accountno;
        if (amount == '' || amount == null) amount = agent.context.get('current_transaction').parameters.amount;
        console.log(amount);
        let send_request = stkPush.prepareSTKPush(accountno, amount, agent, transactionId);
        agent.context.set({ 'name': 'prep-confirmation', 'lifespan': 5, 'parameters': { 'transactionId': send_request.transactionID } });
        agent.context.delete('retry-payment');
        agent.add(`A Mobile pin prompt will be sent to ${accountno} shortly`);
        agent.add(`On receipt enter your pin to approve the transfer`);
        agent.add(`Thank you for banking with us`);
        if (send_request.status) {
            //request stk push
            // agent.context.delete('current_transaction');
            // agent.context.set({
            //     'name': 'current_transaction', 'lifespan': 5, 'parameters':
            //         { 'transactionId': send_request.transactionID, 'amount': amount, 'accountno': accountno }
            // });
            request(send_request.payload).then(function (response) {
                if (response.STATUS === '00') {
                    console.log(response)
                    stkPush.confirmPayment(transactionId, accountno);
                } else {
                    console.log(response);
                    // sms.stkPush('Apologies technical issues prevented MPESA prompt from being sent. Try again later');
                }
            })
                .catch(function (err) {
                    console.log(err);
                    // result.message = ``;
                    // result.status = false;
                });

            // return new Promise((resolve, reject) => {
            //     request(send_request.payload).then(function (response) {
            //         if (response.STATUS === '00') {
            //             console.log(response);
            //             // agent.add(`MPESA prompt sent to ${accountno}! Kindly confirm`);
            //             // agent.add(`Was the MPESA prompt recieved?`);
            //             resolve();
            //         } else {
            //             console.log(response);
            //             agent.add(`Apologies, but their seems to be an issue on Safaricom's end`);
            //             resolve();
            //         }
            //     })
            //         .catch(function (err) {
            //             console.log(err);
            //             result.message = ``;
            //             result.status = false;
            //             agent.add(`Am so sorry their seems to be a problem on our end, we'll try to get our systems back online as soon as possible, sorry for the inconvinence`);
            //             reject();
            //         });
            // });
        }

    }

    function wait(ms) {
        var start = new Date().getTime();
        var end = start;
        while (end < start + ms) {
            end = new Date().getTime();
        }
    }

    function confirmPayment() {
        // let transactionID = fs.readFileSync('transactionId.txt', 'utf8');
        let transactionID = agent.parameters.transactionID;
        if (transactionID == '' || transactionID == null) transactionID = agent.context.get('current_transaction').parameters.transactionId;
        let statusCycle = agent.parameters.cycle;
        console.log(transactionID);
        let payload = stkPush.purchaseService(transactionID);
        agent.add(`Checking....🧐`);
        wait(2500);
        return new Promise((resolve, reject) => {
            console.log('Request for transaction status sent!');
            request(payload).then(function (res) {
                var response = res.status;
                console.log(res);
                if (response != '15') {
                    console.log('User has responded to stk push\n');
                    switch (response) {
                        case '55':
                            agent.context.delete('prep-confirmation');
                            agent.context.delete('current-transactionid');
                            agent.context.set({
                                'name': 'current_transactionid', 'lifespan': 5, 'parameters':
                                    { 'transactionId': transactionID }
                            });
                            agent.context.set({ 'name': 'retry-payment', 'lifespan': 5, 'parameters': { 'transactionId': transactionID } });
                            agent.add(`Seems the transaction was cancelled.Would you like to try again?`);
                            console.log('\nTransaction was Cancelled\n');
                            resolve();
                            break;
                        case '00':
                            agent.context.delete('prep-confirmation');
                            agent.context.delete('current-transactionid');
                            agent.context.delete('current_transaction');
                            agent.add(`The Mobile Money transaction was successfull 😃`);
                            agent.add(`We'll reverse the payment later since this is a test usecase, thanks for trying it out though 😊`);
                            console.log('\nTransaction was Successful\n');
                            resolve();
                            break;
                        default:
                            agent.add(`Sorry seems I'm unable to function properly at the moment ??`);
                            agent.add(`An alert has been sent to my support team. Please try again later`)
                            resolve();
                            break;
                    }
                } else {
                    console.log(`Transaction still pending!`);
                    agent.setFollowupEvent(`CHECK_TRANSACTION_${String(statusCycle)}`);
                    console.log(`CHECK_TRANSACTION_${String(statusCycle)}`);
                    resolve();
                }
            })
                .catch(function (err) {
                    agent.add(`Sorry seems I'm unable to function properly at the moment ??`);
                    agent.add(`An alert has been sent to my support team. Please try again later`)
                    console.log(`Error!: ${err}`);
                    reject(`Error!: ${err}`);
                })

        })


    }

    async function registerCustomer() {
        let requestId = `ECL_2.0_${uuid.v4()}`;
        let deadline = 3000;
        return new Promise((resolve, reject) => {
            // agent.add('Something')
            let exceeded = false;
            let ontime = false;
            agent.context.delete('prep-confirmation');
            setTimeout(() => {
                if (!ontime) {
                    agent.context.set({ 'name': 'chain_action', 'lifespan': 10, 'parameters': { 'action': 'register' } })
                    agent.setFollowupEvent(`CHECK_TRANSACTION_0`)
                    agent.add('Please wait....')
                    console.log(`\nDEADLINE EXCEEDED(${deadline / 1000} seconds are up), REQUEST CHAINING INITIATED`)
                    exceeded = true;
                    resolve();
                }
            }, deadline);

            agent.context.set({ 'name': 'current_request', 'lifespan': 10, 'parameters': { 'requestId': requestId } })
            let first_name = "Chris"
            let middle_name = "Kahiga"
            let surname = "Theuri"
            let dob = "15021995"
            let email_address = "criskahiga@gmail.com"
            let phone_number = "254704349218"
            let id_number = "32560815"
            let reqUrl = "https://saccotest.ekenya.co.ke:8095/api/MobileWebService"
            let reqBody = {
                "data": {
                    "service_name": "Register",
                    "first_name": first_name,
                    "middle_name": middle_name,
                    "surname": surname,
                    "email_address": email_address,
                    "id_number": id_number,
                    "dob": dob,
                    "phone_number": phone_number,
                    "geolocation": "Home",
                    "user_agent_version": "22 (5.1.1)",
                    "user_agent": "android"
                }
            }
            let options = {
                method: 'POST',
                uri: reqUrl,
                body: reqBody,
                headers: {
                    'x-message-type': '0'
                },
                json: true
            }
            request(options).then((result) => {
                console.log('\nRESPONSE RECIEVED')
                if (exceeded) console.log('..STORING IN REDIS')
                ontime = true;
                const responseJSON = result;
                let user_errors = responseJSON.data.response.errors;
                if (user_errors) {
                    let error_array = [];
                    console.log(user_errors);
                    Object.keys(user_errors).forEach(function (key) {
                        error_array.push(jsonData[key]);
                    });
                    let user_error_response = [error_array.slice(0, -1).join(', '), error_array.slice(-1)[0]].join(error_array < 2 ? '' : ' and ')
                    agent.add(`Sorry we couldn't successfully verify your info, due to ${user_error_response}`)
                } else {
                    agent.add('Registration was successful');
                }
                // Save the Mobile API response in Redis store
                client.setex(`request: ${requestId}`, 3600, JSON.stringify({ source: 'Redis Cache', ...responseJSON, }))
                agent.add('Response recieved from Mobile API')
                resolve()
            }).catch(err => {
                console.log('\nREQUEST ERROR!')
                agent.add('Request Error!')
                console.log(err)
                reject()
            })

        })
    }
    function chainRequest() {

        switch (agent.context.get('chain_action').parameters.action) {
            case 'register':
                return new Promise((resolve, reject) => {
                    chainHandler.checkRegistration(agent, client).then((result) => {
                        if (result) {
                            let user_errors = result.data.response.errors;
                            if (user_errors) {
                                let error_array = [];
                                console.log(user_errors);
                                Object.keys(user_errors).forEach(function (key) {
                                    error_array.push(jsonData[key]);
                                });
                                let user_error_response = [error_array.slice(0, -1).join(', '), error_array.slice(-1)[0]].join(error_array < 2 ? '' : ' and ')
                                agent.add(`Sorry we couldn't successfully verify your info, due to ${user_error_response}`)
                            } else {
                                agent.add('Registration was successfull');
                            }
                            resolve()
                        } else {
                            let statusCycle = agent.parameters.cycle;
                            agent.setFollowupEvent(`CHECK_TRANSACTION_${statusCycle}`)
                            console.log(`CHECK_TRANSACTION_${statusCycle}`);
                            agent.add('Checking....')
                            resolve()
                        }
                    })
                })
        }

    }

    function sendOTP() {
        let otp = Math.floor(1000 + Math.random() * 9000);
        agent.context.set({
            'name': 'verify-otp', 'lifespan': 5, 'parameters':
                { 'otp_sent': otp, 'phone': agent.parameters.phone }
        });
        agent.add(`An OTP has been sent to ${agent.parameters.phone}, enter it on receipt to proceed`)
        let phone = stkPush.formatNumber(agent.parameters.phone)
        sms.sendSms(`+${phone}`, `Your OTP is ${String(otp)}`)
    }

    function verifyOTP() {
        if (agent.parameters.otp === agent.context.get('verify-otp').parameters.otp_sent) {
            agent.add("Your balance as of today is KES 1,000")
            agent.add("Thank you for banking with us")
            //After confirming to begin feedback collection process
            agent.context.set({
                'name': 'request-feedback', 'lifespan': 2, 'parameters': {}
            });
            agent.add("Can you spare a few seconds? We would love to get your feedback")
            agent.context.delete("verify-otp")
        } else {
            agent.context.set({ 'name': 'resend_otp', 'lifespan': 2, 'parameters': { 'phone': agent.context.get('verify-otp').parameters.phone } })
            agent.add(`Sorry, but that OTP is incorrect, should we try sending again?`)
        }
    }
    //Test handler
    function testHandler(){
        agent.context.set({
            'name': 'request-feedback', 'lifespan': 2, 'parameters': {}
        });
        agent.add("Can you spare a few seconds? We would love to get your feedback")
    }

    // FEEDBACK HANDLERS
    function assessFeedbackRating() {
        let rate = agent.parameters.rate;
        if (rate != '') {
            if(Number(rate) < 4){
                agent.add(chooseStatement(rate, false));
                agent.context.set({
                    'name': 'explain-rating', 'lifespan': 3, 'parameters':
                        { 'rate': rate}
                });
                if(rate < 3){agent.setFollowupEvent('LOW_RATE_GIVEN')}
                else{
                    agent.setFollowupEvent('AVERAGE_RATE_GIVEN')
                }
            }else{
                agent.add(`Thank you for your feedback Chris!`)
                agent.add(`It's been a pleasure serving you`)
                agent.add(`Your feedback will help us continue improving your experience. Goodbye`)
            }
        } else {
            agent.add(`How likely are you to recommend Eclectics Digital Banking to others? ( 𝟏 -Remote 𝟐 -Unlikely 𝟑 -Average 𝟒 -Likely 𝟓 -Extremely likely)`);
        }
    }

    function assessFeedbackStmt() {
        let rate = agent.context.get('explain-rating').parameters.rate;
        let statement = agent.parameters.statement;
        if(statement != ''){
            agent.add(`Thank you for your feedback Chris!`)
            agent.add(`We apologize for any inconvenience caused`)
            agent.add(`We will look into your feedback and take corrective measures so that you may have a pleasant experience next time`)
        }
    }

    function chooseStatement(rate, ending_stmt) {
        let stmt = [];
        switch (Number(rate)) {
            case 1:
                if (ending_stmt) {
                    stmt[0] = "Thank you for your feedback Chris!"
                    stmt[1] = "We apologize for any inconvenience caused"
                    stmt[2] = "We will look into your feedback and take corrective measures so that you may have a pleasant experience next time"
                } else {
                    stmt[0] = "What would you say were the main issues?";
                }
                break;
            case 2:
                if (ending_stmt) {
                    stmt[0] = "Thank you for your feedback Chris!"
                    stmt[1] = "We apologize for any inconvenience caused"
                    stmt[2] = "We will look into your feedback and take corrective measures so that you may have a pleasant experience next time"
                } else {
                    stmt[0] = "What would you say were the main issues?";
                }
                break;
            case 3:
                if (ending_stmt) {
                    stmt[0] = "Thank you for your feedback Chris!"
                    stmt[1] = "We apologize for any inconvenience caused"
                    stmt[2] = "We will look into your feedback and take corrective measures so that you may have a pleasant experience next time"
                } else {
                    stmt[0] = "How would you like Eclectics Digital Banking to improve your experience?";
                }
                break;
            default:
                if (ending_stmt) {
                    stmt[0] = "Thank you for your feedback Chris!"
                    stmt[1] = "It's been a pleasure serving you"
                    stmt[2] = "Your feedback will help us continue to improve your experience. Goodbye"
                } else {

                    stmt = "Error in rate value";
                }
                break;
        }
        return stmt;
    }

    let intentMap = new Map()
    intentMap.set('Default Welcome Intent', welcome)
    intentMap.set('banker.check.balance', sendOTP)
    intentMap.set('resend-otp-yes', sendOTP)
    intentMap.set('banker.check.balance - custom', verifyOTP)
    intentMap.set('banker.transfer.funds', prepareFundsTransfer)
    intentMap.set('proceed.pay.yes', startPayment)
    intentMap.set('retry.payment.yes', restartPayment)
    intentMap.set('confirm.pay.yes', confirmPayment)   //status 0
    // intentMap.set('confirm.pay.status', chainRequest) //status 1
    // intentMap.set('confirm.pay.status1', chainRequest) //status 2
    // intentMap.set('confirm.pay.status2', chainRequest)
    // intentMap.set('confirm.pay.status3', chainRequest)
    intentMap.set('confirm.pay.status', confirmPayment) //status 1
    intentMap.set('confirm.pay.status1', confirmPayment) //status 2
    intentMap.set('confirm.pay.status2', confirmPayment)
    intentMap.set('confirm.pay.status3', confirmPayment)
    intentMap.set('feedback.start.yes', assessFeedbackRating)
    intentMap.set('feedback.explain.rating', assessFeedbackStmt)
    intentMap.set('feedback.explain.rating.b', assessFeedbackStmt)
    // intentMap.set('confirm.pay.status4', confirmPayment)
    intentMap.set('test', testHandler)
    agent.handleRequest(intentMap)
})

module.exports = app
