import express, { json } from 'express'
import cors from 'cors'
import chalk from 'chalk'
import { MongoClient } from 'mongodb'
import joi from 'joi'
import dotenv from 'dotenv'
import dayjs from 'dayjs'

const app = express()
app.use(cors())
app.use(json())

dotenv.config()

let db = null
const mongoClient = new MongoClient(process.env.MONGO_URL) 
mongoClient.connect().then(()=>{
    db = mongoClient.db(process.env.DATABASE) 
    console.log(chalk.blue.bold('Banco de dados conectado com sucesso!'))
}).catch(e => console.log(chalk.red.bold('Problema na conexão com o banco'), e))



const participantSchema = joi.object({
    name: joi.string().alphanum().min(1).required()
})

const message = joi.object({
    from: joi.string().required(), 
    to: joi.string().required(), 
    text: joi.string().required(), 
    type: joi.string().valid('message', 'private_message').required(),
    time: joi.string().required()
})


app.listen(process.env.DOOR, () => console.log(chalk.bold.cyan(`Server listening at http://localhost:${process.env.DOOR}`)))

app.post('/participants', async (req, res) => {

    const participant = req.body
    const {error} = participantSchema.validate(participant)

    if (error) 
        return res.status(422).send('Error validating participant name!')

    try {
        const participantExists = await db.collection('participants').findOne({ name: participant.name })
       
        if (participantExists)
            return res.status(409).send(`There is already a user named ${participant.name}`)

        await db.collection('participants').insertOne({ name: participant.name, lastStatus: Date.now() })
        await db.collection('messages').insertOne({
            from: participant.name, 
            to: 'Todos', 
            text: 'entra na sala...', 
            type: 'status',
            time: dayjs().format('HH:mm:ss')
        })

        res.status(201)

    } catch (e) {
        res.status(500).send(e)
    } 
})


app.get('/participants', async (req, res) => {
    try {
        const participants = await db.collection('participants').find().toArray()
        console.log(participants)
        res.send(participants)
    } catch (e) {
        res.status(500).send("Error")
    }
})

app.get('/messages', async (req, res) => {

    const { user } = req.headers
    const { limit } = parseInt(req.query)

    try {
        const messages = await db.collection('messages').find().toArray()

        const userMsgs = messages.find(message => {
           const {from, to, type} = message
           const toUser = to == 'Todos' || ( to == user || from == user)
           const isPublic = type == 'messages'

           return toUser || isPublic
        })


        if (limit !== NaN)
            return res.send(userMsgs.slice(-limit))

        res.send(userMsgs)

    } catch (e) {
        res.status(400).send(e)
    }finally{
        mongoClient.close()
    }
})

app.post('/messages', async (req, res) => {

    const message = req.body

    const messageSchema = joi.object({ 
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message','private_message').required(),
    })


    const {error} = messageSchema.validate(message, { abortEarly: false })

    if (error) 
        return res.status(422).send(error.details.map(details => details.message))

    const {user} = req.headers

    try {
        const participant = await db.collection('participants').findOne({ name: user })
        
        if (!participant)
            return res.status(422).send(`Participant ${user} not found!`)

        await db.collection('messages').insertOne({
            from: user, 
            to: message.to, 
            text: message.text, 
            type: message.type,
            time: dayjs().format('HH:mm:ss')
        })

        res.sendStatus(201)

    } catch (e) {
        return res.status(422).send("User doesn't exist")
    }
})

app.post('/status', async (req, res) => {
    const user = req.headers.user

    try {
        const participant = await db.collection('participants').findOne({ name: user })

        if (!participant)
            return res.status(404).send(`There is not a user named ${user}`)

        await participant.updateOne(
            { _id: user._id },
            { $set: { lastStatus: Date.now() } }
        )

        res.status(200).send('User inserted at participants database!')
        
    } catch (e){
        res.status(500).send(e)
    }
})