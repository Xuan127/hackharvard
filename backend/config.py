"""
Configuration file for Real Grocery Sustainability Scorer
Store your API keys here for easy management
"""

import os

# Use environment variables as primary source, with fallback to hardcoded values
API_KEYS = {
    'OXYLABS_USERNAME': os.getenv('OXYLABS_USERNAME', 'manoj_DU7cr'),
    'OXYLABS_PASSWORD': os.getenv('OXYLABS_PASSWORD', 'ManojDaBeast+7'),
    'GEMINI_API_KEY': os.getenv('GEMINI_API_KEY', 'AIzaSyCg-1qhL8u8bB_LA5Cjpb2RHPvysrrEiEc'),
    'NEWS_API_KEY': os.getenv('NEWS_API_KEY', 'afd145576b9f4f7f91416be0acb5db03'),
    'USDA_API_KEY': os.getenv('USDA_API_KEY', 'la9NWPFZF84fyiOlgbIaY1Z2vBZhIOPgvzXDbB50')
}

# Alternative: You can also set these as environment variables
# The code will check environment variables first, then fall back to this config
