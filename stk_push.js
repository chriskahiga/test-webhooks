'use strict';

const sms = require('./sms');
var request = require('request-promise');
var result = {};

module.exports = {
    formatNumber: (accountno) => {
        if (accountno.length === 10 && accountno.startsWith("07")) {
            var phone = Number(accountno) + 254000000000;
            return phone;
        } else if (accountno.startsWith("254")) {
            return accountno;
        } else {
            return false;
        }
    },
    checkAccount_temp: (accountno) => {
        let allowedAccounts = ['254704349218', '254715748115'];
        let validAccount = false;
        allowedAccounts.forEach((acc) => {
            if (Number(acc) === Number(accountno)) {
                validAccount = true;
            }
        });
        return validAccount;
    },
    prepareSTKPush: (accountno, amount, agent, transactionId) => {

        if (accountno.length === 10 && accountno.startsWith("07")) {
            var extractNDC = accountno.substring(
                accountno.indexOf("0") + 1,
                4
            );
            var NDC = Number(extractNDC);
            var phone = Number(accountno) + 254000000000;
            var reqUrl = "https://testgateway.ekenya.co.ke:8443/ServiceLayer/onlinecheckout/request";
            // var transactionId = `ECL_2.0_${uuid.v4()}`;

            //   if(amount.startsWith("KES"))amount = Math.floor(Number(amount.replace(/[^\d.]/g, '')));

            var reqBody = {

                username: "ndungu.joseph@ekenya.co.ke",
                password: "8f46b17d9c9c93f43320c0416db093f47a396fd1724bce0185f369c5d1f5b19416b321f5ec7f05bbbd1d8a36b5d6fb26f6c1a944ea824236a95c1d9dab58b230",
                clientid: "5109",
                amount: `${String(amount)}`,
                accountno: phone,
                narration: "Online Checkout",
                serviceid: "5067",
                msisdn: phone,
                transactionid: transactionId,
                accountreference: "REF001"

            }

            const options = {
                method: 'POST',
                uri: reqUrl,
                body: reqBody,
                json: true
            }
            if ((NDC >= 701 && NDC <= 729) || (NDC >= 740 && NDC <= 743) || (NDC >= 745 && NDC <= 746) || NDC === 748 || (NDC >= 768 && NDC <= 769)
                || (NDC >= 757 && NDC <= 759) || (NDC >= 790 && NDC <= 799)) {
                result.message = ``;
                result.status = true;
                result.payload = options;
                result.transactionID = transactionId;
                return result;
            } else {
                result.status = false;
                agent.add(`Sorry but ${accountno} isn't a recognized Safaricom line`);
                return result;
            }
        } else {
            result.status = false;
            agent.add(`Kindly check if the mobile number you provided is valid`);
            return result;
        }

    },

    purchaseService: (transaction) => {
        var reqUrl = 'https://testgateway.ekenya.co.ke:8443/ServiceLayer/transaction/query';
        var reqBody = {

            username: "ndungu.joseph@ekenya.co.ke",
            password: "8f46b17d9c9c93f43320c0416db093f47a396fd1724bce0185f369c5d1f5b19416b321f5ec7f05bbbd1d8a36b5d6fb26f6c1a944ea824236a95c1d9dab58b230",
            clientid: "5109",
            serviceid: "5067",
            transactionid: transaction
        }

        var options = {
            method: 'POST',
            uri: reqUrl,
            body: reqBody,
            json: true
        }

        return options;
    },

    buyAirtime: (transaction, resObj, amount, accountno) => {
        var serviceUrl = 'https://testgateway.ekenya.co.ke:8443/ServiceLayer/request/postRequest';
        var dateProcessed = resObj.dateProcessed;
        var airtimeReq = {
            msisdn: String(accountno),
            amount: amount,
            currencycode: "KES",
            timestamp: dateProcessed,
            accountno: accountno,
            username: "ndungu.joseph@ekenya.co.ke",
            password: "8f46b17d9c9c93f43320c0416db093f47a396fd1724bce0185f369c5d1f5b19416b321f5ec7f05bbbd1d8a36b5d6fb26f6c1a944ea824236a95c1d9dab58b230",
            clientid: "5109",
            serviceid: "6119",
            narration: "Allocate Airtime",
            transactionid: transaction
        }
        var options = {
            method: 'POST',
            uri: serviceUrl,
            body: airtimeReq,
            json: true
        }

        return options;
    },

    confirmPayment: (transaction, phone) => {
        phone = `+${transform(phone)}`;
        var reqUrl = 'https://testgateway.ekenya.co.ke:8443/ServiceLayer/transaction/query';
        var reqBody = {

            username: "ndungu.joseph@ekenya.co.ke",
            password: "8f46b17d9c9c93f43320c0416db093f47a396fd1724bce0185f369c5d1f5b19416b321f5ec7f05bbbd1d8a36b5d6fb26f6c1a944ea824236a95c1d9dab58b230",
            clientid: "5109",
            serviceid: "5067",
            transactionid: transaction
        }

        var options = {
            method: 'POST',
            uri: reqUrl,
            body: reqBody,
            json: true
        }
        var deadline = 15000;
        var count = 0;
        requestLoop();
        function transform(accountno) {
            if (accountno.length === 10 && accountno.startsWith("07")) {
                var phone = Number(accountno) + 254000000000;
                return phone;
            } else if (accountno.startsWith("254")) {
                return accountno;
            } else {
                return false;
            }
        }
        function requestLoop() {
            request(options).then(function (res) {
                var response = res.status;
                console.log(res);
                if (response != '15') {
                    console.log('User has responded to stk push\n');
                    switch (response) {
                        case '55':
                            console.log('Transfer was cancelled')
                            break;
                        case '00':
                            console.log('Transfer was approved')
                            sms.sendSms(phone, `Thank you for approving funds transfer, Your funds will be reversed within 24 Hrs`);
                            break;
                        default:
                            console.log('Some unknown response code');
                            break;
                    }
                } else {
                    if (count < 20000) {
                        console.log(`Transaction still pending!`);
                        wait(1500);
                        count = count + 1500;
                        console.log(`${count / 1000}s`)
                        requestLoop();
                    }else{
                        console.log("Transaction lasted longer than 20s, Checking Cancelled")
                    }
                }
            })
                .catch(function (err) {
                    console.log(`Error!: ${err}`);
                })
        }
        function wait(ms) {
            var start = new Date().getTime();
            var end = start;
            while (end < start + ms) {
                end = new Date().getTime();
            }
        }
    }


};