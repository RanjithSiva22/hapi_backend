'use strict';

const Hapi = require('@hapi/hapi');
const MySQL = require('mysql');
// const jwt= require('jsonwebtoken');
const Jwt = require('@hapi/jwt');
let redis = require('ioredis');

const server = Hapi.Server({
    host: 'localhost',
    port: 1234,
    routes: { cors: { origin: ["*"], credentials: true } }
});
const connection = MySQL.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'hapidb'
});
const client = redis.createClient({
    host: 'localhost',
    port: 6379,
    password: "hapicache"
});

const init = async () => {
    await server.start();
    console.log(`Server started on: ${server.info.uri}`);

    client.on('connect', function (err) {
        console.log('REDIS Connected!');
    });

    client.on('error', err => {
        console.log('redis Error ' + err);
    });
}




// routes
server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
        return ("Hello World!");
    },
});

server.route({
    method: 'POST',
    path: '/block/{mail}',
    handler: async (request, h) => {

        if (request.headers.authorization) {

            const token = request.headers.authorization;

            const ruser = request.params.mail;
            const bluser = await client.get(JSON.parse(ruser));
            console.log("---------block---------------");
            console.log(bluser);
            if (!bluser) {
                return { msg: "token expired" };
            }
            const check = checkToken(token);

            // const rcache = await client.get();
            if (check.isValid) {
                const buser = request.payload;
                const rcache = await client.get(buser.email);
                console.log(rcache)
                if (!rcache) {
                    return { msg: "user not login" };
                }
                await client.expire(buser.email, 0);
                return { msg: "sucess" };

            } else {
                return { auth: "failed" };
            }

        }else {
            return { msg: "please login" };
        }

    },
});

server.route({
    method: 'GET',
    path: '/users/{email}',
    handler: async function (request, h) {
        // console.log(request.headers.authorization);
        if (request.headers.authorization) {


            const rcache = await client.get(JSON.parse(request.params.email));
            console.log("------------------------");

            console.log(rcache);
            if (!rcache) {
                return { msg: "token expired" };
            }
            const token = request.headers.authorization;

            // console.log("work1");

            const check = checkToken(token);

            // const rcache = await client.get();
            if (check.isValid) {

                const rdsusers = await client.get("allusers");
                if (rdsusers) {
                    const rusers = JSON.parse(rdsusers);
                    console.log("redis");
                    return rusers;

                }
                const users = await getAllUsers();
                const result = await client.set("allusers", JSON.stringify(users));
                console.log("------------ra------------");

                console.log(result);
                // console.log(users);
                return users;

            } else {
                return { msg: "auth failed" };
            }
        } else {
            return { msg: "please login" };
        }


    },
    // config: { auth: 'jwt' },
});

server.route({
    method: 'POST',
    path: '/delete/{id}',
    handler: async function (request, h) {

        if (request.headers.authorization) {

            const token = request.headers.authorization;

            // const user = await getUmail();
            console.log(request.payload.email)
            const ruser = request.payload.email;
            const rcache = await client.get(JSON.parse(ruser));
            console.log("---------del---------------");

            console.log(rcache);
            if (!rcache) {
                return { msg: "token expired" };
            }
            // console.log("work1");

            const check = checkToken(token);

            // const rcache = await client.get();
            if (check.isValid) {
                const res = await deleteUser(request.params.id);
                console.log(res);

                const users = await getAllUsers();
                const result = await client.set("allusers", JSON.stringify(users));
                console.log("------------del user------------");

                console.log(result);

                return { msg: "sucess" };

            } else {
                return { auth: "failed" };
            }
        } else {
            return { msg: "please login" };
        }
    }
})

server.route({
    method: 'POST',
    path: '/login',
    handler: async function (request, h) {

        const { email, pwd } = request.payload;
        // console.log(request.payload);
        // console.log(id);
        const user = await getUser(email);

        console.log(user);
        if (user.length == 0) {
            return { message: "User not registered" };
        }

        if (email === user[0].email && pwd === user[0].pwd) {

            let jwtToken = Jwt.token.generate(user, "secret");
            // console.log(jwtToken);

            const rcache = await client.set(email, jwtToken);
            console.log(rcache);

            var response = h.response({ message: "auth ok", user: user, token: jwtToken });
            response.header('Authorization', jwtToken);
            response.code(201);
            return response;
            // return "User Login Sucess";
        } else {
            return { message: "Invalid user or pwd" };
        }

    },

});


process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

// connections
init();
connection.connect(function (err) {
    if (err) throw err;
    console.log("Connected!");
});


// ------------------------------------------------------------

const verifyToken = (artifact, secret, options = {}) => {

    try {
        Jwt.token.verify(artifact, secret, options);
        return { isValid: true };
    }
    catch (err) {
        return {
            isValid: false,
            error: err.message
        };
    }

};


const checkToken = (token) => {
    const decodedToken = Jwt.token.decode(token);
    // console.log(decodedToken.decoded.payload);
    // console.log("work2");
    // const mail=decodedToken.decoded.payload['0'];
    // console.log(mail);

    const verify = verifyToken(decodedToken, "secret");
    // console.log(verify);
    return verify;
}


function getUser(email) {
    // console.log(email)
    return new Promise((resolve, reject) => {
        connection.query(`SELECT * FROM users WHERE email = '${email}' `, [], function (err, results) {
            if (err) {
                return reject(error)
            }

            // console.log(results);

            return resolve(results);
        })
    })
}





function getAllUsers() {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM users', [], function (err, results) {
            if (err) {
                return reject(error)
            }

            // console.log(results);

            return resolve(results);
        })
    })
}


function deleteUser(id) {
    return new Promise((resolve, reject) => {
        connection.query(`DELETE FROM users WHERE id= ${id}`, [], function (err, results) {
            if (err) {
                return reject(error)
            }

            // console.log(results);

            return resolve(results);
        })
    })
}








// bring your own validation function
// const validate = async function (decoded, request, h) {
//     const users = await getAllUsers();
//     console.log(users);
//     console.log(decoded);

//     // do your checks to see if the person is valid
//     if (!users[decoded.id]) {
//         return { isValid: false };
//     }
//     else {
//         return { isValid: true };
//     }
// };




    // // include our module here ↓↓, for example, require('hapi-auth-jwt2')
    // await server.register(require('hapi-auth-jwt'));
    // server.auth.strategy('jwt', 'jwt',
    //     {
    //         key: 'NeverShareYourSecret', // Never Share your secret key
    //         validate  // validate function defined above
    //     });

    // server.auth.default('jwt');