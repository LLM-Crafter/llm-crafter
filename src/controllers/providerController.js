const Provider = require('../models/Provider');
const { refreshDefaultProviders } = require('../config/defaultProviders');

const getProviders = async (req, res) => {
  try {
    const providers = await Provider.find({});
    res.json(providers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
};

const getProvider = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
};

const getProviderModels = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    res.json({ provider: provider.name, models: provider.models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch provider models' });
  }
};

const createProvider = async (req, res) => {
  try {
    const provider = new Provider({
      name: req.body.name,
      models: req.body.models,
    });
    await provider.save();
    res.status(201).json(provider);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Provider already exists' });
    }
    res.status(500).json({ error: 'Failed to create provider' });
  }
};

const updateProvider = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (req.body.name) {
      provider.name = req.body.name;
    }
    if (req.body.models) {
      provider.models = req.body.models;
    }

    await provider.save();
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update provider' });
  }
};

const deleteProvider = async (req, res) => {
  try {
    const provider = await Provider.findByIdAndDelete(req.params.providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    res.json({ message: 'Provider deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete provider' });
  }
};

const refreshProviders = async (req, res) => {
  try {
    await refreshDefaultProviders();
    const providers = await Provider.find({});
    res.json({
      message: 'Default providers refreshed successfully',
      providers,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh default providers' });
  }
};

module.exports = {
  getProviders,
  getProvider,
  getProviderModels,
  createProvider,
  updateProvider,
  deleteProvider,
  refreshProviders,
};
