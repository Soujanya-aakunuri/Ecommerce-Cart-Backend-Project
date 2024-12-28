// Backend for E-Commerce Cart and Payment Gateway Integration (JavaScript)

const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios');
const crypto = require('crypto');

// Initialize Express app and middleware
const app = express();
app.use(bodyParser.json());

// Initialize Sequelize (SQLite for simplicity)
const sequelize = new Sequelize('sqlite::memory:');

// Define Models
const User = sequelize.define('User', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    }
});

const Product = sequelize.define('Product', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    stock: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

const Cart = sequelize.define('Cart', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

const Order = sequelize.define('Order', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    totalAmount: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    paymentStatus: {
        type: DataTypes.STRING,
        defaultValue: 'Pending'
    },
    paymentId: {
        type: DataTypes.STRING
    }
});

// Sync Database
sequelize.sync({ force: true }).then(() => {
    console.log('Database synced');
});

// Helper Function to Calculate Cart Total
const calculateCartTotal = async (userId) => {
    const cartItems = await Cart.findAll({ where: { userId } });
    let total = 0;
    for (let item of cartItems) {
        const product = await Product.findByPk(item.productId);
        total += product.price * item.quantity;
    }
    return total;
};

// API Routes

// Add to Cart
app.post('/cart', async (req, res) => {
    const { userId, productId, quantity } = req.body;
    try {
        const cartItem = await Cart.create({ userId, productId, quantity });
        res.status(201).json({ message: 'Item added to cart', cartItem });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Fetch Cart
app.get('/cart/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const cartItems = await Cart.findAll({ where: { userId } });
        const cartDetails = [];
        for (let item of cartItems) {
            const product = await Product.findByPk(item.productId);
            cartDetails.push({
                productId: product.id,
                name: product.name,
                price: product.price,
                quantity: item.quantity
            });
        }
        res.status(200).json({ cart: cartDetails });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update Cart
app.put('/cart', async (req, res) => {
    const { userId, productId, quantity } = req.body;
    try {
        const cartItem = await Cart.findOne({ where: { userId, productId } });
        if (cartItem) {
            cartItem.quantity = quantity;
            await cartItem.save();
            res.status(200).json({ message: 'Cart updated', cartItem });
        } else {
            res.status(404).json({ error: 'Item not found in cart' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Remove from Cart
app.delete('/cart', async (req, res) => {
    const { userId, productId } = req.body;
    try {
        const cartItem = await Cart.findOne({ where: { userId, productId } });
        if (cartItem) {
            await cartItem.destroy();
            res.status(200).json({ message: 'Item removed from cart' });
        } else {
            res.status(404).json({ error: 'Item not found in cart' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Initiate Payment
app.post('/payment/initiate', async (req, res) => {
    const { userId } = req.body;
    try {
        const totalAmount = await calculateCartTotal(userId);

        const payload = {
            orderId: `order_${userId}_${Date.now()}`,
            orderAmount: totalAmount,
            orderCurrency: 'INR',
            customerEmail: 'user@example.com',
            customerPhone: '9876543210'
        };

        const headers = {
            'Content-Type': 'application/json',
            'x-client-id': 'your_client_id',
            'x-client-secret': 'your_client_secret'
        };

        const response = await axios.post('https://test.cashfree.com/api/v1/order/create', payload, { headers });

        if (response.status === 200) {
            const paymentData = response.data;
            const order = await Order.create({ userId, totalAmount, paymentId: paymentData.payment_id });
            res.status(200).json(paymentData);
        } else {
            res.status(400).json({ error: 'Payment initiation failed' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Webhook for Payment Status
app.post('/payment/webhook', async (req, res) => {
    const data = req.body;
    const signature = req.headers['x-webhook-signature'];
    const secretKey = 'your_webhook_secret_key';

    // Validate Signature
    const computedSignature = crypto.createHmac('sha256', secretKey).update(JSON.stringify(data)).digest('hex');
    if (computedSignature !== signature) {
        return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
        const order = await Order.findOne({ where: { paymentId: data.payment_id } });
        if (order) {
            order.paymentStatus = data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
            await order.save();
            res.status(200).json({ message: 'Payment status updated' });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Start the Server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
