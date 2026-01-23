const amqp = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;

const EXCHANGE_NAME = "facebook_events";

async function connectToRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    /*
assertExchange: Creates the exchange if it doesn’t exist.
await channel.assertExchange(name, type, options);

Exchange (super short): A router that receives messages and decides which queues get them.
> name → exchange name , > type → direct | topic | fanout | headers , > options → durable, etc.

assertExchange → create a router
assertQueue → create a mailbox
bindQueue → connect router to mailbox
Typical flow:
await channel.assertExchange("ex", "topic");
await channel.assertQueue("q");
await channel.bindQueue("q", "ex", "key");
*/
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

async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  /*assertQueue (brief):

It creates the queue if it doesn’t exist and ensures it exists.
await channel.assertQueue(queue, options);
-> Declares a queue safely (idempotent)
-> Does not connect it to an exchange
-> Returns queue info (name, messageCount, consumerCount)
*/
  const q = await channel.assertQueue("", { exclusive: true });

  /* bindQueue → connects a queue to an exchange
await channel.bindQueue(queue, exchange, pattern, args);

queue = destination ,exchange = source ,pattern = routing rule (direct: exact, topic: *, #, fanout: ignored ""), args = optional (headers exchange)

No binding → no messages */
  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);
  channel.consume(q.queue, (msg) => {
    if (msg != null) {
      const content = JSON.parse(msg.content.toString());
      callback(content);
      channel.ack(msg);
    }
  });

  logger.info(`Subscribed to event: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, publishEvent, consumeEvent };

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
If you try to use `15672` in `amqplib`, it will fail — that port speaks HTTP, not AMQP.
*/
