// backend/config/db.js
import mongoose from 'mongoose';
import 'dotenv/config'; 

const connectDB = async () => {
  try {

    const conn = await mongoose.connect(process.env.MONGO_URI);

  
    console.log(`MongoDB Conectado: ${conn.connection.host}`);

  } catch (error) {

    console.error(`Error conectando a MongoDB: ${error.message}`);
    process.exit(1); 
  }
};

export default connectDB;