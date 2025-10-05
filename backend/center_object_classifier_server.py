#!/usr/bin/env python3
"""
Center Object Classifier with WebSocket Server
Runs the object classifier and provides WebSocket communication for cart updates
"""

import asyncio
import threading
from flask import Flask
from flask_socketio import SocketIO, emit
from center_object_classifier import CenterObjectClassifier

# Initialize Flask app with SocketIO
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global classifier instance
classifier = None

@socketio.on('connect')
def handle_connect():
    print('🔌 Frontend connected to WebSocket')

@socketio.on('disconnect')
def handle_disconnect():
    print('🔌 Frontend disconnected from WebSocket')

@socketio.on('request_cart_status')
def handle_cart_status():
    """Send current cart status to frontend"""
    if classifier and classifier.cart:
        cart_items = []
        for item_key, item_data in classifier.cart.items():
            cart_item = {
                'id': item_key.replace(' ', '_'),
                'name': f"{item_data['name']} ({item_data['brand']})",
                'price': 0.0,  # Default price
                'image': '/placeholder.svg',
                'sustainabilityScore': 75  # Default score
            }
            cart_items.append(cart_item)
        
        emit('cart_items', cart_items)
        print(f"📤 Sent {len(cart_items)} cart items to frontend")

def run_classifier():
    """Run the object classifier in a separate thread"""
    global classifier
    
    # Create classifier instance
    classifier = CenterObjectClassifier(enable_tts=False)
    
    # Override the emit function to use our SocketIO instance
    def emit_cart_update(cart_item):
        try:
            socketio.emit('cart_item_added', cart_item, broadcast=True)
            print(f"📤 Sent cart update to frontend: {cart_item['name']}")
        except Exception as e:
            print(f"⚠️ Failed to send cart update: {e}")
    
    # Monkey patch the emit function in the classifier
    import flask_socketio
    original_emit = flask_socketio.emit
    
    def patched_emit(event, data=None, **kwargs):
        if event == 'cart_item_added':
            emit_cart_update(data)
        else:
            original_emit(event, data, **kwargs)
    
    # Replace the emit function in the classifier's context
    import sys
    if 'flask_socketio' in sys.modules:
        sys.modules['flask_socketio'].emit = patched_emit
    
    # Run the classifier
    asyncio.run(classifier.run())

def start_classifier_thread():
    """Start the classifier in a background thread"""
    classifier_thread = threading.Thread(target=run_classifier, daemon=True)
    classifier_thread.start()
    print("🤖 Object classifier started in background thread")

@app.route('/')
def index():
    return {'status': 'Center Object Classifier Server Running', 'cart_items': len(classifier.cart) if classifier else 0}

@app.route('/health')
def health():
    return {'status': 'healthy', 'classifier_running': classifier is not None}

@app.route('/cart')
def get_cart():
    """Get current cart contents"""
    if not classifier:
        return {'cart': [], 'message': 'Classifier not initialized'}
    
    cart_items = []
    for item_key, item_data in classifier.cart.items():
        cart_item = {
            'id': item_key.replace(' ', '_'),
            'name': f"{item_data['name']} ({item_data['brand']})",
            'price': 0.0,
            'image': '/placeholder.svg',
            'sustainabilityScore': 75
        }
        cart_items.append(cart_item)
    
    return {
        'cart': cart_items,
        'total_items': len(cart_items),
        'classifier_status': 'running'
    }

if __name__ == '__main__':
    print("🚀 Starting Center Object Classifier Server...")
    print("📍 WebSocket server will be available at: http://localhost:5008")
    print("🔌 Frontend should connect to: ws://localhost:5008")
    print("🤖 Object classifier will start automatically")
    
    # Start the classifier in a background thread
    start_classifier_thread()
    
    # Start the Flask-SocketIO server
    socketio.run(app, host='0.0.0.0', port=5008, debug=True)
