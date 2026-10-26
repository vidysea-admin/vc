'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING, unique: true, validate: { isEmail: true } },
      role: Sequelize.ENUM('student', 'counsellor'),
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("now() -- }, 'x'") },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  },
};
