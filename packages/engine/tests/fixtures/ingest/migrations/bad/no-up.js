module.exports = { down: async (queryInterface) => { await queryInterface.dropTable('users'); } };
