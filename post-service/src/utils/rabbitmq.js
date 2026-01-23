const amqp = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "facebook_events";

async function connectToRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });
    logger.info("Connected to rabbit mq");
    return channel;
  } catch (e) {
    logger.error("Error connecting to rabbit mq", e);
  }
}

async function publishEvent(routingKey, message) {
  if (!channel) {
    await connectToRabbitMQ();
  }
  /*publish is not something you wrote.
   It comes from RabbitMQ’s Channel API, provided by amqplib.*/
  channel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(JSON.stringify(message))
  );
  logger.info(`Event published: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, publishEvent };

/*
Short answer: **they are for two different things.**

### `15672` → **RabbitMQ Management UI (HTTP)**

* URL: `http://localhost:15672`
* Used in **browser**
* For humans: dashboard, users, queues, exchanges
* Username/password login
* **NOT** used in your Node.js app

### `5672` → **AMQP protocol (for apps)**

* Used in `.env`
* For **services / code**
* What `amqplib` connects to
* Example:

```env
RABBITMQ_URL=amqp://dev_admin:Dev@12345@localhost:5672
```

### Rule to remember

* 👀 **Browser → 15672**
* 🤖 **Code → 5672**

If you try to use `15672` in `amqplib`, it will fail — that port speaks HTTP, not AMQP.
*/
