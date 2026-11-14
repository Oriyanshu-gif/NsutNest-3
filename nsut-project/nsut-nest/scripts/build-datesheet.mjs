/**
 * Script to parse and generate the complete NSUT Odd Semester 2026-27 End-Sem Date Sheet.
 */
import fs from 'fs';
import path from 'path';

const rawPages = [
  // Page 2: B.Tech Sem 1
  `B.Tech.	1	FCMT001	Mathematics-I	23-11-2026	Shift 2
B.Tech.	1	FCMT0101	Mathematics-I	23-11-2026	Shift 2
B.Tech.	1	FCCS002	Computer Programming	26-11-2026	Shift 2
B.Tech.	1	FCCS0102	Computer Programming	26-11-2026	Shift 2
B.Tech.	1	FCHS005	English	26-11-2026	Shift 2
B.Tech.	1	FCHS0105	English	26-11-2026	Shift 2
B.Tech.	1	FCCW0106	Basic Civil Engineering	27-11-2026	Shift 1
B.Tech.	1	FCME0116	Engineering Graphics & CAD	27-11-2026	Shift 1
B.Tech.	1	FCEC003	Electronics and Electrical Engineering	30-11-2026	Shift 2
B.Tech.	1	FCCH0103	Environment Science & Green Chemistry	30-11-2026	Shift 2
B.Tech.	1	FCPH0124	Oscillations, Waves and Optics	30-11-2026	Shift 2
B.Tech.	1	FCPH0114	Quantum Physics	30-11-2026	Shift 2
B.Tech.	1	FCEC0116	Basics of Analog & Digital Electronics	02-12-2026	Shift 2
B.Tech.	1	FCEC0106	Basics of Electronics & Communication Engineering	02-12-2026	Shift 2
B.Tech.	1	FCME006	Basics of Mechanical Engg.	04-12-2026	Shift 2
B.Tech.	1	FCME0106	Basics of Mechanical Engineering	04-12-2026	Shift 2
B.Tech.	1	FCEE0106	Fundamentals of Electrical Engineering	04-12-2026	Shift 2`,

  // Page 3: B.Tech Sem 3 (part 1)
  `B.Tech.	3	BTBTC301	Biochemistry	25-11-2026	Shift 2
B.Tech.	3	CMMTC301	Engineering Mathematics	25-11-2026	Shift 2
B.Tech.	3	EEMTC301	Engineering Mathematics	25-11-2026	Shift 2
B.Tech.	3	ICMTC301	Engineering Mathematics	25-11-2026	Shift 2
B.Tech.	3	ECMTC301	Mathematics For Communication & Signal Processing	25-11-2026	Shift 2
B.Tech.	3	EPMTC301	Mathematics For Machine Learning	25-11-2026	Shift 2
B.Tech.	3	ECMTC04	Mathematics for Signal Processing and Communication	25-11-2026	Shift 2
B.Tech.	3	EEMTC04	Mathematics III	25-11-2026	Shift 2
B.Tech.	3	MEMTC04	Numerical Methods & Computation	25-11-2026	Shift 2
B.Tech.	3	MEMTC301	Numerical Methods & Computation	25-11-2026	Shift 2
B.Tech.	3	MVMTC301	Numerical Methods & Computation	25-11-2026	Shift 2
B.Tech.	3	CEMTC301	Numerical Methods and Computation	25-11-2026	Shift 2
B.Tech.	3	CGMTC301	Numerical Methods and Computation	25-11-2026	Shift 2
B.Tech.	3	CACSC301	Operating Systems	25-11-2026	Shift 2
B.Tech.	3	CDCSC301	Operating Systems	25-11-2026	Shift 2
B.Tech.	3	COCSC301	Operating Systems	25-11-2026	Shift 2
B.Tech.	3	INMTC301	Optimization Principles and Techniques	25-11-2026	Shift 2
B.Tech.	3	ITMTC04	Optimization Principles and Techniques	25-11-2026	Shift 2
B.Tech.	3	ITMTC301	Optimization Principles and Techniques	25-11-2026	Shift 2
B.Tech.	3	EIMTC301	Optimizations Principles and Techniques	25-11-2026	Shift 2
B.Tech.	3	CBCPC301	Software Engineering	25-11-2026	Shift 2
B.Tech.	3	CICPC301	Software Engineering	25-11-2026	Shift 2
B.Tech.	3	VTPHC301	Solid State Physics	25-11-2026	Shift 2
B.Tech.	3	CECWC303	Building Materials and Construction	27-11-2026	Shift 2
B.Tech.	3	BTITC305	Data Structures & Algorithms	27-11-2026	Shift 2
B.Tech.	3	EEITC302	Data Structures & Algorithms	27-11-2026	Shift 2
B.Tech.	3	ICCSC302	Data Structures & Algorithms	27-11-2026	Shift 2
B.Tech.	3	CMCSC302	Database Management System	27-11-2026	Shift 2
B.Tech.	3	COCSC302	Database Management System	27-11-2026	Shift 2
B.Tech.	3	INITC302	Database Management System	27-11-2026	Shift 2
B.Tech.	3	ITITC05	Database Management System	27-11-2026	Shift 2
B.Tech.	3	ITITC302	Database Management System	27-11-2026	Shift 2
B.Tech.	3	CACSC302	Database Management Systems	27-11-2026	Shift 2
B.Tech.	3	CBCPC302	Database Management Systems	27-11-2026	Shift 2
B.Tech.	3	CDCSC302	Database Management Systems	27-11-2026	Shift 2
B.Tech.	3	CICPC302	Database Management Systems	27-11-2026	Shift 2
B.Tech.	3	MVMWC05	Manufacturing Processes - I	27-11-2026	Shift 2
B.Tech.	3	MEMEC302	Manufacturing Processes-I	27-11-2026	Shift 2
B.Tech.	3	MVMWC302	Manufacturing Processes-I	27-11-2026	Shift 2
B.Tech.	3	EAEPC302	Signals and Systems	27-11-2026	Shift 2
B.Tech.	3	ECECC302	Signals and Systems	27-11-2026	Shift 2
B.Tech.	3	EIECC302	Signals and Systems	27-11-2026	Shift 2
B.Tech.	3	VTECC302	Signals and Systems	27-11-2026	Shift 2
B.Tech.	3	CGECC302	Signals and Systems For Geo-Informatics	27-11-2026	Shift 2
B.Tech.	3	CMMTC303	Applied Linear Algebra	01-12-2026	Shift 2
B.Tech.	3	BTBTC303	Chemical Engineering Principles	01-12-2026	Shift 2
B.Tech.	3	INITC303	Computer System Organization	01-12-2026	Shift 2
B.Tech.	3	ITITC303	Computer System Organization	01-12-2026	Shift 2
B.Tech.	3	CACSC303	Design and Analysis of Algorithms	01-12-2026	Shift 2
B.Tech.	3	CBCPC303	Design and Analysis of Algorithms	01-12-2026	Shift 2
B.Tech.	3	CDCSC303	Design and Analysis of Algorithms	01-12-2026	Shift 2
B.Tech.	3	CICPC303	Design and Analysis of Algorithms	01-12-2026	Shift 2`,

  // Page 4: B.Tech Sem 3 (part 2)
  `B.Tech.	3	COCSC303	Design and Analysis of Algorithms	01-12-2026	Shift 2
B.Tech.	3	EEEEC303	Electrical Circuit Theory and Analysis	01-12-2026	Shift 2
B.Tech.	3	CEGWC302	Geographical Information System	01-12-2026	Shift 2
B.Tech.	3	CGGWC303	Geographical Information System	01-12-2026	Shift 2
B.Tech.	3	ICICC303	Power Apparatus	01-12-2026	Shift 2
B.Tech.	3	EAEPC303	Probability Theory and Random Process	01-12-2026	Shift 2
B.Tech.	3	ECECC303	Probability Theory and Random Process	01-12-2026	Shift 2
B.Tech.	3	VTECC303	Probability Theory and Random Process	01-12-2026	Shift 2
B.Tech.	3	ECECC06	Probabilty Thoery And Random Processes	01-12-2026	Shift 2
B.Tech.	3	MEMEC06	Strength of Materials	01-12-2026	Shift 2
B.Tech.	3	MEMEC303	Strength of Materials	01-12-2026	Shift 2
B.Tech.	3	MVMWC07	Thermal Engineering - I	01-12-2026	Shift 2
B.Tech.	3	MVMWC303	Thermal Engineering-II	01-12-2026	Shift 2
B.Tech.	3	INITC304	Advance Programming	03-12-2026	Shift 2
B.Tech.	3	ITITC304	Advance Programming	03-12-2026	Shift 2
B.Tech.	3	CGGWC304	Advance Surveying	03-12-2026	Shift 2
B.Tech.	3	CECWC305	Advanced Surveying	03-12-2026	Shift 2
B.Tech.	3	EEEEC305	Computational Methods In Electrical Engineering	03-12-2026	Shift 2
B.Tech.	3	CACSC304	Computer Architecture & Organization	03-12-2026	Shift 2
B.Tech.	3	CDCSC304	Computer Architecture & Organization	03-12-2026	Shift 2
B.Tech.	3	COCSC304	Computer Architecture & Organization	03-12-2026	Shift 2
B.Tech.	3	CBCPC07	Computer Architecture and Organization	03-12-2026	Shift 2
B.Tech.	3	CBCPC304	Computer Architecture and Organization	03-12-2026	Shift 2
B.Tech.	3	CICPC304	Computer Architecture and Organization	03-12-2026	Shift 2
B.Tech.	3	CMECC304	Digital Logic Design	03-12-2026	Shift 2
B.Tech.	3	ICICC07	Electronic Instrumentation	03-12-2026	Shift 2
B.Tech.	3	ICICC304	Electronic Instrumentation	03-12-2026	Shift 2
B.Tech.	3	EEEEC06	Engineering Analysis & Design	03-12-2026	Shift 2
B.Tech.	3	BTBTC08	Microbiology	03-12-2026	Shift 2
B.Tech.	3	BTBTC304	Microbiology	03-12-2026	Shift 2
B.Tech.	3	VTECC304	Microelectronics	03-12-2026	Shift 2
B.Tech.	3	EAEPC304	Microelectronics Circuits and Applications	03-12-2026	Shift 2
B.Tech.	3	ECECC304	Microelectronics Circuits and Applications	03-12-2026	Shift 2
B.Tech.	3	MVMWC304	Strength of Materials	03-12-2026	Shift 2
B.Tech.	3	MEMEC07	Thermal Engineering-I	03-12-2026	Shift 2
B.Tech.	3	MEMEC304	Thermal Engineering-I	03-12-2026	Shift 2
B.Tech.	3	EEEEC07	Electrical Machine I	04-12-2026	Shift 1
B.Tech.	3	EEEEC304	Electrical Machines-I	04-12-2026	Shift 1
B.Tech.	3	CECWC304	Structural Analysis	04-12-2026	Shift 1
B.Tech.	3	BTBTC302	Cell Biology	07-12-2026	Shift 2
B.Tech.	3	EAEPC305	Digital Circuits and Systems	07-12-2026	Shift 2
B.Tech.	3	ECECC305	Digital Circuits and Systems	07-12-2026	Shift 2
B.Tech.	3	EEECC08	Digital Circuits and Systems	07-12-2026	Shift 2
B.Tech.	3	ICECC305	Digital Circuits and Systems	07-12-2026	Shift 2
B.Tech.	3	VTECC305	Digital Circuits and Systems	07-12-2026	Shift 2
B.Tech.	3	CGGWC305	Engineering Geology and Geomorphology	07-12-2026	Shift 2
B.Tech.	3	MEMEC08	Fluid Mechanics & Machines	07-12-2026	Shift 2
B.Tech.	3	MEMEC305	Fluid Mechanics & Machines	07-12-2026	Shift 2
B.Tech.	3	MVEEC305	Fundamentals of Electrical Engineering	07-12-2026	Shift 2
B.Tech.	3	CBEPC305	Microprocessor and Microcontrollers	07-12-2026	Shift 2
B.Tech.	3	CIEPC305	Microprocessor and Microcontrollers	07-12-2026	Shift 2
B.Tech.	3	CAMTC305	Probability & Statistics	07-12-2026	Shift 2
B.Tech.	3	CDMTC305	Probability & Statistics	07-12-2026	Shift 2
B.Tech.	3	CMMTC305	Probability & Statistics	07-12-2026	Shift 2`,

  // Page 5: B.Tech Sem 3 (part 3)
  `B.Tech.	3	COMTC305	Probability & Statistics	07-12-2026	Shift 2
B.Tech.	3	INECC305	Probability and Stochastic Processes	07-12-2026	Shift 2
B.Tech.	3	ITECC305	Probability and Stochastic Processes	07-12-2026	Shift 2`,

  // Page 6: B.Tech Sem 5 (part 1)
  `B.Tech.	5	VTECC501	Analog CMOS Design	23-11-2026	Shift 1
B.Tech.	5	MVMWC501	Automobile Engineering	23-11-2026	Shift 1
B.Tech.	5	BTBTC14	Bioinformatics	23-11-2026	Shift 1
B.Tech.	5	BTBTC501	Bioinformatics	23-11-2026	Shift 1
B.Tech.	5	CACSC501	Computer Networks	23-11-2026	Shift 1
B.Tech.	5	CDCSC501	Computer Networks	23-11-2026	Shift 1
B.Tech.	5	CMCSC501	Computer Networks	23-11-2026	Shift 1
B.Tech.	5	COCSC501	Computer Networks	23-11-2026	Shift 1
B.Tech.	5	EIECC503	Computer Networks	23-11-2026	Shift 1
B.Tech.	5	EAEPC501	Digital communication	23-11-2026	Shift 1
B.Tech.	5	CIEPC501	Embedded Systems	23-11-2026	Shift 1
B.Tech.	5	CECWC501	Environmental Engineering	23-11-2026	Shift 1
B.Tech.	5	EEEEC501	Industrial Systems and Automation	23-11-2026	Shift 1
B.Tech.	5	ICICC501	Modern Control Theory	23-11-2026	Shift 1
B.Tech.	5	CBCPC501	Principle of Compiler Construction	23-11-2026	Shift 1
B.Tech.	5	CGGWC501	Programming Data Structures and Algorithms Using Python	23-11-2026	Shift 1
B.Tech.	5	ECECC20	RF and Microwave Engineering	23-11-2026	Shift 1
B.Tech.	5	ECECC501	RF and Microwave Engineering	23-11-2026	Shift 1
B.Tech.	5	MEMEC15	Robotics	23-11-2026	Shift 1
B.Tech.	5	MEMEC501	Robotics	23-11-2026	Shift 1
B.Tech.	5	INITC501	Theory of Computation	23-11-2026	Shift 1
B.Tech.	5	ITITC501	Theory of Computation	23-11-2026	Shift 1
B.Tech.	5	CBCPC502	Artificial Intelligence	26-11-2026	Shift 1
B.Tech.	5	CICPC502	Artificial Intelligence and Machine Learning	26-11-2026	Shift 1
B.Tech.	5	CECWC502	Concrete Technology	26-11-2026	Shift 1
B.Tech.	5	VTECC502	Digital CMOS Integrated Circuits	26-11-2026	Shift 1
B.Tech.	5	ECECC502	Digital Communication	26-11-2026	Shift 1
B.Tech.	5	EAEPC502	Digital Signal Processing	26-11-2026	Shift 1
B.Tech.	5	CGGWC502	Global Navigation Satellite Systems	26-11-2026	Shift 1
B.Tech.	5	EIECC502	IoT System Architecture	26-11-2026	Shift 1
B.Tech.	5	MVMWC502	Material Science & Metallurgy	26-11-2026	Shift 1
B.Tech.	5	MEMEC16	Mechanical Design	26-11-2026	Shift 1
B.Tech.	5	MEMEC502	Mechanical Design	26-11-2026	Shift 1
B.Tech.	5	INITC502	Number Theory and Cryptography	26-11-2026	Shift 1
B.Tech.	5	ITITC502	Number Theory and Cryptography	26-11-2026	Shift 1
B.Tech.	5	CMCSC502	Operating Systems	26-11-2026	Shift 1
B.Tech.	5	EEEEC502	Power System Analysis	26-11-2026	Shift 1
B.Tech.	5	EEEEC16	Power Transmission and Distribution	26-11-2026	Shift 1
B.Tech.	5	COCSC502	Principle of Compiler Construction	26-11-2026	Shift 1
B.Tech.	5	ICICC15	Process Dynamics and Control	26-11-2026	Shift 1
B.Tech.	5	ICICC502	Process Dynamics and Control	26-11-2026	Shift 1
B.Tech.	5	BTBTC15	Recombinant DNA Technology	26-11-2026	Shift 1
B.Tech.	5	BTBTC502	Recombinant DNA Technology	26-11-2026	Shift 1
B.Tech.	5	CACSC502	Software Engineering	26-11-2026	Shift 1
B.Tech.	5	CDCSC502	Software Engineering	26-11-2026	Shift 1
B.Tech.	5	CICPC503	Advance Computer Networks	30-11-2026	Shift 1
B.Tech.	5	INITC503	Artificial Intelligence	30-11-2026	Shift 1
B.Tech.	5	ITITC16	Artificial Intelligence	30-11-2026	Shift 1
B.Tech.	5	ITITC503	Artificial Intelligence	30-11-2026	Shift 1
B.Tech.	5	MEMEC14	Automobile Engineering	30-11-2026	Shift 1
B.Tech.	5	ICECC503	Communication and Optical Instrumentation	30-11-2026	Shift 1
B.Tech.	5	EEEEC15	Control Systems	30-11-2026	Shift 1`,

  // Page 7: B.Tech Sem 5 (part 2)
  `B.Tech.	5	EEEEC503	Control Systems	30-11-2026	Shift 1
B.Tech.	5	CBCPC503	Data Mining	30-11-2026	Shift 1
B.Tech.	5	VTECC504	Electronic Design Workshop	30-11-2026	Shift 1
B.Tech.	5	BTBTC16	Enzyme Technology	30-11-2026	Shift 1
B.Tech.	5	BTBTC503	Enzyme Technology	30-11-2026	Shift 1
B.Tech.	5	CGGWC503	Geoinformatics for Natural Disasters	30-11-2026	Shift 1
B.Tech.	5	CECWC503	Geotechnical and Foundation Engineering	30-11-2026	Shift 1
B.Tech.	5	MEMEC503	Industrial Engineering	30-11-2026	Shift 1
B.Tech.	5	MVMWC503	Mechatronics	30-11-2026	Shift 1
B.Tech.	5	CACSC503	Soft Computing	30-11-2026	Shift 1
B.Tech.	5	CDCSC503	Soft Computing	30-11-2026	Shift 1
B.Tech.	5	CMCSC503	Soft Computing	30-11-2026	Shift 1
B.Tech.	5	COCSC503	Soft Computing	30-11-2026	Shift 1
B.Tech.	5	EAEPC503	Soft Computing	30-11-2026	Shift 1
B.Tech.	5	CECWC16	Transportation Engineering II	30-11-2026	Shift 1
B.Tech.	5	ECECC503	VLSI Design	30-11-2026	Shift 1
B.Tech.	5	MEEEC504	Basics of Electrical Vehicles	02-12-2026	Shift 1
B.Tech.	5	BTBTC17	Biochemical Engineering	02-12-2026	Shift 1
B.Tech.	5	BTBTC504	Biochemical Engineering	02-12-2026	Shift 1
B.Tech.	5	CICPC504	Cloud Computing	02-12-2026	Shift 1
B.Tech.	5	CACSC504	Computer Vision	02-12-2026	Shift 1
B.Tech.	5	MVEEC504	Electric and Hybrid Vehicle Technology	02-12-2026	Shift 1
B.Tech.	5	EEEEC17	Electric Drives	02-12-2026	Shift 1
B.Tech.	5	EEEEC504	Electric Drives	02-12-2026	Shift 1
B.Tech.	5	EAEPC504	Embedded System Design	02-12-2026	Shift 1
B.Tech.	5	ECECC17	Embedded System Design	02-12-2026	Shift 1
B.Tech.	5	ECECC504	Embedded System Design	02-12-2026	Shift 1
B.Tech.	5	VTECC503	Embedded System Design	02-12-2026	Shift 1
B.Tech.	5	CMMTC17	Financial Engineering	02-12-2026	Shift 1
B.Tech.	5	CMMTC504	Financial Engineering	02-12-2026	Shift 1
B.Tech.	5	CDCSC504	Information and Data Security	02-12-2026	Shift 1
B.Tech.	5	COCSC504	Information and Data Security	02-12-2026	Shift 1
B.Tech.	5	CBCPC504	Machine Learning	02-12-2026	Shift 1
B.Tech.	5	INITC504	Mobile Computing	02-12-2026	Shift 1
B.Tech.	5	ITITC17	Mobile Computing	02-12-2026	Shift 1
B.Tech.	5	ITITC504	Mobile Computing	02-12-2026	Shift 1
B.Tech.	5	CECWC504	Quantity Survey and Cost Estimation	02-12-2026	Shift 1
B.Tech.	5	CECWC15	Quantity Surveying and Cost Estimation	02-12-2026	Shift 1
B.Tech.	5	ICICC17	Robotics	02-12-2026	Shift 1
B.Tech.	5	ICICC504	Robotics	02-12-2026	Shift 1
B.Tech.	5	CGGWC504	Web Mapping and Web GIS	02-12-2026	Shift 1
B.Tech.	5	MEMEE506	Advanced Machining Processes	04-12-2026	Shift 1
B.Tech.	5	CECWE503	Condition Assessment of Structures	04-12-2026	Shift 1
B.Tech.	5	CACSE522	Cryptography and Computer Security	04-12-2026	Shift 1
B.Tech.	5	CDCSE540	Data Handling and Visualization Tools	04-12-2026	Shift 1
B.Tech.	5	CBCPE501	Data Science	04-12-2026	Shift 1
B.Tech.	5	CICPE502	Data Science	04-12-2026	Shift 1
B.Tech.	5	ITITE521	Data Warehouse and Data mining	04-12-2026	Shift 1
B.Tech.	5	MEMEE28	Design for Manufacture	04-12-2026	Shift 1
B.Tech.	5	MEMEE501	Design for Manufacture	04-12-2026	Shift 1
B.Tech.	5	ECECE522	Digital Image Processing	04-12-2026	Shift 1
B.Tech.	5	ICICE507	Discrete Time Systems	04-12-2026	Shift 1
B.Tech.	5	EEEEE06	Electrical Engineering Materials	04-12-2026	Shift 1
B.Tech.	5	CECWE541	Environmental Impact Assessment	04-12-2026	Shift 1`,

  // Page 8: B.Tech Sem 5 (part 3)
  `B.Tech.	5	EEEEE503	Intelligent Sensor in Automation	04-12-2026	Shift 1
B.Tech.	5	MVMWE502	Internal Combustion Engines	04-12-2026	Shift 1
B.Tech.	5	VTECE501	Machine Learning and Artificial Intelligence	04-12-2026	Shift 1
B.Tech.	5	COCSE542	Object Oriented Databases	04-12-2026	Shift 1
B.Tech.	5	CMMTE503	Operations Research	04-12-2026	Shift 1
B.Tech.	5	ECECE01	Optical Fiber Communication	04-12-2026	Shift 1
B.Tech.	5	ECECE501	Optical Fiber Communication	04-12-2026	Shift 1
B.Tech.	5	EAEPE501	Opto Electronics and Optical Communication	04-12-2026	Shift 1
B.Tech.	5	CGGWE502	Urban Ecology and Environment	04-12-2026	Shift 1
B.Tech.	5	BTBTE01	Virus: An Invisible Enemy	04-12-2026	Shift 1
B.Tech.	5	BTBTE501	Virus: An Invisible Enemy	04-12-2026	Shift 1
B.Tech.	5	ICICE504	Biomedical Instrumentation	07-12-2026	Shift 1
B.Tech.	5	INITE503	Cloud Computing	07-12-2026	Shift 1
B.Tech.	5	ITITE503	Cloud Computing	07-12-2026	Shift 1
B.Tech.	5	CGGWE504	Database Management System	07-12-2026	Shift 1
B.Tech.	5	ECECE541	Digital System Design using Verilog	07-12-2026	Shift 1
B.Tech.	5	BTBTE05	Environmental Biotechnology	07-12-2026	Shift 1
B.Tech.	5	BTBTE521	Environmental Biotechnology	07-12-2026	Shift 1
B.Tech.	5	ICICE502	Industrial Control Systems	07-12-2026	Shift 1
B.Tech.	5	EAEPE502	Information Theory and Secrecy Analysis	07-12-2026	Shift 1
B.Tech.	5	BTBTE502	Microbiome and Human Health	07-12-2026	Shift 1
B.Tech.	5	CECWE524	Multimodal Transportation Infrastructure	07-12-2026	Shift 1
B.Tech.	5	CECWE543	Open Channel Flow	07-12-2026	Shift 1
B.Tech.	5	MEMEE503	Product Design and Development	07-12-2026	Shift 1
B.Tech.	5	EEEEE507	Renewable Energy Sources	07-12-2026	Shift 1
B.Tech.	5	VTECE504	RTL Design and Verification	07-12-2026	Shift 1
B.Tech.	5	EMPH0601	Civilization, Sciences and Engineering	08-12-2026	Shift 1
B.Tech.	5	EMHS0501	Exploration of Classical Indian Philosophical Heritage	08-12-2026	Shift 1
B.Tech.	5	EMCH0601	Rasayan Shastra in Ancient India	08-12-2026	Shift 1
B.Tech.	5	EMCE0601	Temple and Heritage Geotechnics	08-12-2026	Shift 1`,

  // Page 9: B.Tech Sem 7 (part 1)
  `B.Tech.	7	EAEPE717	Biometrics	25-11-2026	Shift 1
B.Tech.	7	MEMEE706	Design of Mechanisms	25-11-2026	Shift 1
B.Tech.	7	BTBTE701	Drug Discovery	25-11-2026	Shift 1
B.Tech.	7	MVEEE702	Electric Vehicle Charging Technology	25-11-2026	Shift 1
B.Tech.	7	MVMWE52	Electric Vehicle Charging Technology	25-11-2026	Shift 1
B.Tech.	7	EEEEE721	Energy Policies for Sustainable Development	25-11-2026	Shift 1
B.Tech.	7	BTBTE51	Epigenetics	25-11-2026	Shift 1
B.Tech.	7	INITE710	Green Computing	25-11-2026	Shift 1
B.Tech.	7	ITITE710	Green Computing	25-11-2026	Shift 1
B.Tech.	7	CBCPE706	Information Retrieval	25-11-2026	Shift 1
B.Tech.	7	CICPE707	Information Retrieval	25-11-2026	Shift 1
B.Tech.	7	ICICE701	Intelligent Autonomous systems	25-11-2026	Shift 1
B.Tech.	7	CACSE54	Knowledge Based System	25-11-2026	Shift 1
B.Tech.	7	CACSE722	Knowledge Based Systems	25-11-2026	Shift 1
B.Tech.	7	CMCSE722	Knowledge Based Systems	25-11-2026	Shift 1
B.Tech.	7	COCSE701	Software Quality	25-11-2026	Shift 1
B.Tech.	7	CECWE701	Strengthening of Structures	25-11-2026	Shift 1
B.Tech.	7	EIECE705	Wireless Technologies for IOT	25-11-2026	Shift 1
B.Tech.	7	CECWE703	Dynamics of Structures	26-11-2026	Shift 1
B.Tech.	7	MVMWE705	Idea to Business Model	26-11-2026	Shift 1
B.Tech.	7	CGGWE702	Big Data Analytics	27-11-2026	Shift 1
B.Tech.	7	COCSE702	Design and Architectural Patterns	27-11-2026	Shift 1
B.Tech.	7	MEMEE710	Laser Materials Processing	27-11-2026	Shift 1
B.Tech.	7	CBCPE702	Natural Language Processing	27-11-2026	Shift 1
B.Tech.	7	CICPE701	Natural Language Processing	27-11-2026	Shift 1
B.Tech.	7	ITITE725	Pattern Analysis & Recommender Systems	27-11-2026	Shift 1
B.Tech.	7	ITITE69	Pattern Analysis and Recommender Systems	27-11-2026	Shift 1
B.Tech.	7	CACSE724	Responsible AI	27-11-2026	Shift 1
B.Tech.	7	CMCSE724	Responsible AI	27-11-2026	Shift 1
B.Tech.	7	EEEEE722	Selected Topics in Renewable Energy Systems	27-11-2026	Shift 1
B.Tech.	7	ECECE56	Underwater Communication	27-11-2026	Shift 1
B.Tech.	7	ECECE707	Underwater Communication	27-11-2026	Shift 1
B.Tech.	7	BTBTE709	Biosimilars	27-11-2026	Shift 2
B.Tech.	7	EAEPE718	Business Intelligence	27-11-2026	Shift 2
B.Tech.	7	BTBTE711	Big Data and AI in Healthcare	01-12-2026	Shift 1
B.Tech.	7	ICICE707	Biomedical Signal Processing	01-12-2026	Shift 1
B.Tech.	7	MVMWE713	Design of Experiments	01-12-2026	Shift 1
B.Tech.	7	CBCPE705	Human Computer Interface	01-12-2026	Shift 1
B.Tech.	7	CICPE706	Human Computer Interface	01-12-2026	Shift 1
B.Tech.	7	CDCSE741	Information Retrieval System	01-12-2026	Shift 1
B.Tech.	7	CMCSE741	Information Retrieval System	01-12-2026	Shift 1
B.Tech.	7	COCSE741	Information Retrieval System	01-12-2026	Shift 1
B.Tech.	7	CGGWE703	Mobile Computing	01-12-2026	Shift 1
B.Tech.	7	ECECE52	Multimedia Communication	01-12-2026	Shift 1
B.Tech.	7	ECECE703	Multimedia Communication	01-12-2026	Shift 1
B.Tech.	7	MEMEE711	Nanomaterials & Nanotechnology	01-12-2026	Shift 1
B.Tech.	7	EEEEE57	Power System Operation & Control	01-12-2026	Shift 1
B.Tech.	7	INITE704	Steganography and Digital Watermarking	01-12-2026	Shift 1
B.Tech.	7	CECWE723	Traffic Engineering and Safety	01-12-2026	Shift 1
B.Tech.	7	ICICE706	Biomedical Imaging	02-12-2026	Shift 2
B.Tech.	7	CECWE741	Air and Noise Pollution	03-12-2026	Shift 1
B.Tech.	7	BTBTE720	Biological Waste Treatment	03-12-2026	Shift 1`,

  // Page 10: B.Tech Sem 7 (part 2)
  `B.Tech.	7	ECECE749	Design for Testability	03-12-2026	Shift 1
B.Tech.	7	CDCSE740	Multimedia Security and Forensics	03-12-2026	Shift 1
B.Tech.	7	COCSE740	Multimedia Security and Forensics	03-12-2026	Shift 1
B.Tech.	7	ICICE712	Multivariable Control Theory and Applications	03-12-2026	Shift 1
B.Tech.	7	MEMEE715	Project Management	03-12-2026	Shift 1
B.Tech.	7	CGGWE707	Web Technology	03-12-2026	Shift 1
B.Tech.	7	BTBTE721	Biosafety & Hazard Management	04-12-2026	Shift 2
B.Tech.	7	BTBTE59	Biosafety and Hazard Management	04-12-2026	Shift 2
B.Tech.	7	CGGWE701	Computer Networking	04-12-2026	Shift 2
B.Tech.	7	CECWE742	Industrial Wastewater Treatment	04-12-2026	Shift 2`,

  // Page 11: Bachelor of Architecture Semesters 1, 3, 5, 7
  `BACHELOR OF ARCHITECTURE	1	ARAWB01	CONSTRUCTION & MATERIALS - I	23-11-2026	Shift 2
BACHELOR OF ARCHITECTURE	1	ARAWB02	ARCHITECTURAL STRUCTURES - I	26-11-2026	Shift 2
BACHELOR OF ARCHITECTURE	1	ARAWC04	HUMAN SETTLEMENT & PLANNING	30-11-2026	Shift 2
BACHELOR OF ARCHITECTURE	3	ARAWB06	CONSTRUCTION & MATERIALS - III	25-11-2026	Shift 2
BACHELOR OF ARCHITECTURE	3	ARAWB08	CLIMATOLOGY/ BUILDING SCIENCE	01-12-2026	Shift 2
BACHELOR OF ARCHITECTURE	3	ARAWC11	HISTORY OF ARCHITECTURE - I	03-12-2026	Shift 2
BACHELOR OF ARCHITECTURE	3	ARAWB07	ARCHITECTURAL STRUCTURES - III	07-12-2026	Shift 2
BACHELOR OF ARCHITECTURE	5	ARAWB12	CONSTRUCTION & MATERIALS - V	23-11-2026	Shift 1
BACHELOR OF ARCHITECTURE	5	ARAWB13	ARCHITECTURAL STRUCTURES - V	26-11-2026	Shift 1
BACHELOR OF ARCHITECTURE	5	ARAWB14	ARCHITECTURAL SERVICES - II	30-11-2026	Shift 1
BACHELOR OF ARCHITECTURE	5	ARAWC18	HISTORY OF ARCHITECTURE - III	02-12-2026	Shift 1
BACHELOR OF ARCHITECTURE	5	ARAWE53	Psychology in Architecture	04-12-2026	Shift 1
BACHELOR OF ARCHITECTURE	5	ARAWE54	Vernacular Architecture	07-12-2026	Shift 1
BACHELOR OF ARCHITECTURE	7	ARAWB18	Advanced Building Construction	25-11-2026	Shift 1
BACHELOR OF ARCHITECTURE	7	ARAWB19	Architectural Structures-VII	27-11-2026	Shift 1
BACHELOR OF ARCHITECTURE	7	ARAWB20	Landscape Design	01-12-2026	Shift 1
BACHELOR OF ARCHITECTURE	7	ARAWP05	Town Planning	02-12-2026	Shift 2
BACHELOR OF ARCHITECTURE	7	ARAWC22	Urban Design	03-12-2026	Shift 1
BACHELOR OF ARCHITECTURE	7	ARAWE74	Building Economics	04-12-2026	Shift 2`,

  // Page 12: Bachelor of Design Semesters 1, 3, 5, 7
  `BACHELOR OF DESIGN	1	BDDNC101	Evolution of Design	23-11-2026	Shift 2
BACHELOR OF DESIGN	1	BDDNC102	Communication Skills	26-11-2026	Shift 2
BACHELOR OF DESIGN	1	BDDNC105	Applications of Computer Programming in Design - 1	30-11-2026	Shift 2
BACHELOR OF DESIGN	3	BDDNC113	Applied Ergonomics	25-11-2026	Shift 2
BACHELOR OF DESIGN	3	BDDNC114	Product Design	27-11-2026	Shift 2
BACHELOR OF DESIGN	3	BDDNC115	Interaction Design	01-12-2026	Shift 2
BACHELOR OF DESIGN	3	BDDNC116	Game Design	03-12-2026	Shift 1
BACHELOR OF DESIGN	3	BDDNC117	Documentation and Presentation	03-12-2026	Shift 2
BACHELOR OF DESIGN	5	EMMG0901	Entrepreneurial Mind-set and Development	04-12-2026	Shift 1
BACHELOR OF DESIGN	5	EMMG0902	Innovation Management	07-12-2026	Shift 1
BACHELOR OF DESIGN	5	EMPH0601	Civilization, Sciences and Engineering	08-12-2026	Shift 1
BACHELOR OF DESIGN	7	FTDNC30	Apparel Marketing and Merchandising	25-11-2026	Shift 1
BACHELOR OF DESIGN	7	PDDNC30	Design Management	25-11-2026	Shift 1
BACHELOR OF DESIGN	7	FTDNE08	UX Design for Emerging Tech	27-11-2026	Shift 1
BACHELOR OF DESIGN	7	PDDNE04	UX Design for Emerging Tech	27-11-2026	Shift 1
BACHELOR OF DESIGN	7	FTDNE23	Design Management	01-12-2026	Shift 1`,

  // Page 13: BBA (Honours) Semesters 1, 3, 5, 7
  `BBA (HONOURS)	1	BBHC1101	Management Processes and Organizational Behavior	23-11-2026	Shift 2
BBA (HONOURS)	1	BBHC1102	Financial Accounting	26-11-2026	Shift 2
BBA (HONOURS)	1	BBHC1103	Marketing Management	30-11-2026	Shift 2
BBA (HONOURS)	1	BBHC1104	Basics of Business Economics	02-12-2026	Shift 2
BBA (HONOURS)	1	BBHA1101	Business Communication	04-12-2026	Shift 2
BBA (HONOURS)	3	BBHC2101	Cost and Management Accounting	25-11-2026	Shift 2
BBA (HONOURS)	3	BBHC2102	Human Resource Management	27-11-2026	Shift 2
BBA (HONOURS)	3	BBHC2103	Business Statistics	01-12-2026	Shift 2
BBA (HONOURS)	3	BBHU2101	Introduction to Data Analytics	07-12-2026	Shift 2
BBA (HONOURS)	3	BBHC2104	Consumer Behaviour	09-12-2026	Shift 1
BBA (HONOURS)	3	BBHS2101	Business Problem Solving using Computer Applications	09-12-2026	Shift 2
BBA (HONOURS)	5	BBHC3101	Strategic Management	23-11-2026	Shift 1
BBA (HONOURS)	5	BBDS3101	Introduction to Programming (Python)	26-11-2026	Shift 1
BBA (HONOURS)	5	BBHM3102	Integrated Marketing Communication	30-11-2026	Shift 1
BBA (HONOURS)	5	BBHF3101	Security Analysis and Portfolio Management	30-11-2026	Shift 1
BBA (HONOURS)	5	BBHM3103	Advertisement and Brand Management	02-12-2026	Shift 1
BBA (HONOURS)	5	BBHF3102	Fundamentals of Investing in Stock Market	02-12-2026	Shift 1
BBA (HONOURS)	5	BBHM3104	Digital Marketing	04-12-2026	Shift 1
BBA (HONOURS)	5	BBHF3104	Financial Markets and Institutions	04-12-2026	Shift 1
BBA (HONOURS)	5	BBHS3101	Management Information System	07-12-2026	Shift 1
BBA (HONOURS)	5	BBHS3103	Critical Thinking Skills	08-12-2026	Shift 1
BBA (HONOURS)	7	BBHM4101	Industrial Marketing	23-11-2026	Shift 2
BBA (HONOURS)	7	BBHC4101	Design Thinking and Innovation	25-11-2026	Shift 1
BBA (HONOURS)	7	BBHC4102	International Business	27-11-2026	Shift 1
BBA (HONOURS)	7	BBDS3107	Business Metrics and Analytics	01-12-2026	Shift 1
BBA (HONOURS)	7	BBHM4102	Retail Marketing	01-12-2026	Shift 2
BBA (HONOURS)	7	BBHF4104	Behavioural Finance	02-12-2026	Shift 2
BBA (HONOURS)	7	BBHF4101	Good and Service Tax (GST)	03-12-2026	Shift 1
BBA (HONOURS)	7	BBHM4105	Marketing Analytics	04-12-2026	Shift 2`,

  // Page 14: Integrated BBA-MBA IEV Semesters 1, 3, 5, 7, 9
  `Integrated BBA-MBA IEV	1	BBIC105	Business Communication Skills	25-11-2026	Shift 1
Integrated BBA-MBA IEV	3	BBIC301	Innovation and Start-up Eco System in India	25-11-2026	Shift 2
Integrated BBA-MBA IEV	3	BBIC302	Marketing Principles for Entrepreneurs and Start-ups	27-11-2026	Shift 2
Integrated BBA-MBA IEV	5	BBIC501	Business Strategies and Frameworks	23-11-2026	Shift 1
Integrated BBA-MBA IEV	5	BBIC502	Entrepreneurship And Innovation: A Business Model Approach	26-11-2026	Shift 1
Integrated BBA-MBA IEV	5	BBIC503	Social Media and the Digital Economy for Entrepreneurs	28-11-2026	Shift 1
Integrated BBA-MBA IEV	5	BBIC504	IPRs for Entrepreneurs	30-11-2026	Shift 1
Integrated BBA-MBA IEV	5	BBIC507	Buying and Selling of Business - I	01-12-2026	Shift 1
Integrated BBA-MBA IEV	7	PBIC101	Entrepreneurial Mindset and Opportunity Recognition	25-11-2026	Shift 1
Integrated BBA-MBA IEV	7	PBIC104	Entrepreneurial Economics	26-11-2026	Shift 2
Integrated BBA-MBA IEV	7	PBIC102	Innovation Management	27-11-2026	Shift 1
Integrated BBA-MBA IEV	7	PBIC105	Communication skills for Entrepreneurs	30-11-2026	Shift 2
Integrated BBA-MBA IEV	7	PBIC103	Startup Ecosystem and Business Models	02-12-2026	Shift 1
Integrated BBA-MBA IEV	7	PBIC106	Data-Driven Decision Making for Startups	03-12-2026	Shift 2
Integrated BBA-MBA IEV	9	PBIE301	Operations & Supply Chain Strategy for Startups	23-11-2026	Shift 2
Integrated BBA-MBA IEV	9	PBIE302	Digital Marketing for Startups	25-11-2026	Shift 2
Integrated BBA-MBA IEV	9	PBIE303	Circular Business Models & Sustainable Entrepreneurship	27-11-2026	Shift 2
Integrated BBA-MBA IEV	9	PBIC301	Venture Growth Strategies / Go-to-Market Strategy	07-12-2026	Shift 2`,

  // Page 15: M.Tech (Full Time) Semester 1 (part 1)
  `M.Tech (FULL TIME)	1	AICPC101	Advanced Data Structures and Algorithms	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	VLEPC101	Analog CMOS Circuits	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	BTBIC101	Concepts in Modern Biology	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	ISCPC101	Cryptography Foundation and Its Applications	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	CSCSE01	Machine Learning	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	QTMTC101	Mathematical Methods for Quantum Technologies	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	EEPEC101	Sustainable Energy Technologies	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	CYCSC101	System and Network Security	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	ECEVC01	VLSI Design	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	EVECC101	VLSI Design	23-11-2026	Shift 2
M.Tech (FULL TIME)	1	EEPEC102	Advanced Power Electronics	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	AICPC102	Artificial Intelligence	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	ISCPC102	Cyber Crime Forensics	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	VLEPC102	Digital IC Design	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	EVECC102	Embedded System Design	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	QTPHC102	Quantum Mechanics	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	BTBIC102	Sequence Bioinformatics	26-11-2026	Shift 2
M.Tech (FULL TIME)	1	ADCSC101	Advanced Data Structures and Algorithms	30-11-2026	Shift 1
M.Tech (FULL TIME)	1	CSCSC101	Advanced Data Structures and Algorithms	30-11-2026	Shift 1
M.Tech (FULL TIME)	1	MTITC101	Advanced Data Structures and Algorithms	30-11-2026	Shift 1
M.Tech (FULL TIME)	1	EEPEC103	Advanced Control System	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	BTBIC103	Artificial Intelligence in life sciences	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	ECEVE01	Digital System Design	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	EVECC103	Digital System Design	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	CSCSC103	Distributed Systems	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	ADBSE104	Foundation of Healthcare	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	VLEPC103	High-Speed Semiconductor Devices	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	CYITC102	Information Security	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	MTITC103	Information Security	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	AICPC103	Machine Learning	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	QTITC103	Quantum Computation	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	ISCPC103	Wireless Security	30-11-2026	Shift 2
M.Tech (FULL TIME)	1	CYITC103	Cyber Laws	01-12-2026	Shift 2
M.Tech (FULL TIME)	1	ADCSC102	AI and Machine Learning	02-12-2026	Shift 1
M.Tech (FULL TIME)	1	CSCSE101	AI and Machine Learning	02-12-2026	Shift 1
M.Tech (FULL TIME)	1	MTITC102	AI and Machine Learning	02-12-2026	Shift 1
M.Tech (FULL TIME)	1	AICPE103	Cyber Security	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	BTBIE102	Data Structures	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	ADCSE101	Ethics, Privacy & Regulations in AI & Healthcare	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	QTECE101	Lightwave Communication	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	VLEPE102	Low power CMOS VLSI Design	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	EVECE101	Mixed Signal IC Design	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	ISCPE109	Security Issues in Operating System	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	EEPEE104	Smart Grid Technologies	02-12-2026	Shift 2
M.Tech (FULL TIME)	1	CSCSC102	Advanced Computer Networks	03-12-2026	Shift 2
M.Tech (FULL TIME)	1	CYCSE101	Advanced Computer Networks	03-12-2026	Shift 2
M.Tech (FULL TIME)	1	MTITE101	Advanced Computer Networks	03-12-2026	Shift 2
M.Tech (FULL TIME)	1	VLEPE104	ASIC Design	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	QTECE103	Classical & Quantum Information Theory	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	BTBIE327	Current topics in Bioinformatics-II	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	EEPEE121	Electric and Hybrid Vehicles	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	AICPE105	Security Issues in Cloud Computing	04-12-2026	Shift 2`,

  // Page 16: M.Tech (Full Time) Semester 1 (part 2)
  `M.Tech (FULL TIME)	1	ISCPE101	Security Issues in Cloud Computing	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	EVECE102	Semiconductor Devices	04-12-2026	Shift 2
M.Tech (FULL TIME)	1	ADCSC103	Big Data Analytics	07-12-2026	Shift 2
M.Tech (FULL TIME)	1	CSCSE104	Blockchain and Applications	08-12-2026	Shift 1
M.Tech (FULL TIME)	1	CYCSE105	Blockchain and Applications	08-12-2026	Shift 1
M.Tech (FULL TIME)	1	MTITE104	Blockchain and Applications	08-12-2026	Shift 1`,

  // Page 17: M.Tech (Full Time) Semester 3
  `M.Tech (FULL TIME)	3	BTBIE13	Computer Aided Vaccine Design	27-11-2026	Shift 2
M.Tech (FULL TIME)	3	CPAIE05	Human Computer Interaction	27-11-2026	Shift 2
M.Tech (FULL TIME)	3	CPISE06	Security Issues in Information Systems	27-11-2026	Shift 2`,

  // Page 18: Master of Arts Semesters 1, 3
  `MASTER OF ARTS	1	HSAPC101	Cognitive Processes and Applications	23-11-2026	Shift 2
MASTER OF ARTS	1	HSHEC101	Poetry I	23-11-2026	Shift 2
MASTER OF ARTS	1	HSHEC02	Drama I	26-11-2026	Shift 2
MASTER OF ARTS	1	HSHEC102	Drama I	26-11-2026	Shift 2
MASTER OF ARTS	1	HSAPC102	Quantitative Research Methods	26-11-2026	Shift 2
MASTER OF ARTS	1	HSHEC103	Fiction I	30-11-2026	Shift 2
MASTER OF ARTS	1	HSAPE101	Community Psychology	02-12-2026	Shift 2
MASTER OF ARTS	1	HSHEE101	The History of English Literature I	02-12-2026	Shift 2
MASTER OF ARTS	1	HSHEE103	Gender Studies	04-12-2026	Shift 2
MASTER OF ARTS	1	HSAPE102	Social Psychology	04-12-2026	Shift 2
MASTER OF ARTS	3	HSAPE01	Forensic Psychology	25-11-2026	Shift 2
MASTER OF ARTS	3	HSHEC09	Poetry II	25-11-2026	Shift 2
MASTER OF ARTS	3	HSHEC10	Drama II	27-11-2026	Shift 2
MASTER OF ARTS	3	HSAPE03	Neuropsychology	27-11-2026	Shift 2
MASTER OF ARTS	3	HSHEC11	Fiction II	01-12-2026	Shift 2
MASTER OF ARTS	3	HSAPE13	Psychopathology	01-12-2026	Shift 2
MASTER OF ARTS	3	HSHEC12	Linguistics II	03-12-2026	Shift 1
MASTER OF ARTS	3	HSHEE02	20th Centuary Dystopian Fiction I	03-12-2026	Shift 2
MASTER OF ARTS	3	HSEO103	Behaviour Modification And Behaviour Therapy	03-12-2026	Shift 2
MASTER OF ARTS	3	HSHEE03	American Literature	07-12-2026	Shift 2
MASTER OF ARTS	3	HSEO104	Psychological Assessment And Profiling	07-12-2026	Shift 2`,

  // Page 19: Master of Science Semesters 1, 3
  `MASTER OF SCIENCE	1	PHPHC02	Classical Mechanics	23-11-2026	Shift 2
MASTER OF SCIENCE	1	PHPHC101	Classical Mechanics	23-11-2026	Shift 2
MASTER OF SCIENCE	1	MTMTC101	Ordinary Differential Equations	23-11-2026	Shift 2
MASTER OF SCIENCE	1	CHCHC101	Reactive Intermediates in Organic Chemistry	23-11-2026	Shift 2
MASTER OF SCIENCE	1	CHCHE107	Techniques in Chemistry	25-11-2026	Shift 1
MASTER OF SCIENCE	1	MTMTE106	Theory of Elasticity	25-11-2026	Shift 1
MASTER OF SCIENCE	1	MTMTC102	Algebra	26-11-2026	Shift 2
MASTER OF SCIENCE	1	CHCHC102	Coordination Chemistry	26-11-2026	Shift 2
MASTER OF SCIENCE	1	PHPHC102	Mathematical Physics	26-11-2026	Shift 2
MASTER OF SCIENCE	1	MTMTC103	Probability and Statistics	30-11-2026	Shift 2
MASTER OF SCIENCE	1	CHCHC103	Quantum Chemistry & Chemical Bonding	30-11-2026	Shift 2
MASTER OF SCIENCE	1	PHPHC03	Quantum Mechanics-I	30-11-2026	Shift 2
MASTER OF SCIENCE	1	MTMTC02	Real Analysis	30-11-2026	Shift 2
MASTER OF SCIENCE	1	PHPHC103	Solid State Physics	30-11-2026	Shift 2
MASTER OF SCIENCE	1	PHPHE101	Applied Optics	02-12-2026	Shift 2
MASTER OF SCIENCE	1	CHCHE101	Group Theory & its Applications	02-12-2026	Shift 2
MASTER OF SCIENCE	1	MTMTE102	Introduction to Number Theory	02-12-2026	Shift 2
MASTER OF SCIENCE	1	CHCHE102	Analytical Chemistry	04-12-2026	Shift 2
MASTER OF SCIENCE	1	MTMTE105	Calculus of Variations and Integral Equations	04-12-2026	Shift 2
MASTER OF SCIENCE	1	PHPHE104	Nano Science & Nanotechnology	04-12-2026	Shift 2
MASTER OF SCIENCE	3	PHPHC10	Nuclear and Particle Physics	25-11-2026	Shift 2
MASTER OF SCIENCE	3	CHCHC10	Organic Chemistry-III	25-11-2026	Shift 2
MASTER OF SCIENCE	3	MTMTC10	Partial Differential Equations	25-11-2026	Shift 2
MASTER OF SCIENCE	3	PHPHC11	Electrodynamics and Wave Guides	27-11-2026	Shift 2
MASTER OF SCIENCE	3	MTMTC11	Functional Analysis	27-11-2026	Shift 2
MASTER OF SCIENCE	3	CHCHC11	Inorganic Chemistry-III	27-11-2026	Shift 2
MASTER OF SCIENCE	3	PHPHC12	Atomic and Molecular Physics	01-12-2026	Shift 2
MASTER OF SCIENCE	3	MTMTC12	Financial Mathematics	01-12-2026	Shift 2
MASTER OF SCIENCE	3	CHCHC12	Physical Chemistry-III	01-12-2026	Shift 2
MASTER OF SCIENCE	3	CHCHE03	Green Chemistry	03-12-2026	Shift 2
MASTER OF SCIENCE	3	MTMTC13	Measure Theory	03-12-2026	Shift 2
MASTER OF SCIENCE	3	PHPHE01	Optoelectronics and Photonics	03-12-2026	Shift 2
MASTER OF SCIENCE	3	PHPHE09	Computational Physics	07-12-2026	Shift 2
MASTER OF SCIENCE	3	MTMTE12	Introduction to Cosmology	07-12-2026	Shift 2`,

  // Page 20: MBA Semesters 1, 3
  `MBA	1	PBC1103	Business Statistics and Operations Research	23-11-2026	Shift 2
MBA	1	PBC1101	Accounting for Business	25-11-2026	Shift 1
MBA	1	PBC1104	Organisational Behaviour	26-11-2026	Shift 2
MBA	1	PBC1102	Marketing Management	27-11-2026	Shift 1
MBA	1	PBC1105	Managerial Economics	30-11-2026	Shift 2
MBA	1	PBC1106	Business Analytics for Decision Making	03-12-2026	Shift 2
MBA	1	PBC1107	Business Communication	07-12-2026	Shift 1
MBA	1	PBC1108	Legal and Business Environment	07-12-2026	Shift 2
MBA	1	PBC1109	Computer Applications for Business	08-12-2026	Shift 1
MBA	3	PBC2101	Strategic Management	25-11-2026	Shift 2
MBA	3	PBF2105	Financial Derivatives	27-11-2026	Shift 1
MBA	3	MBIC302	Digital Marketing of Innovations	27-11-2026	Shift 2
MBA	3	PBC2102	Project Management	27-11-2026	Shift 2
MBA	3	PBM2105	Digital marketing	30-11-2026	Shift 1
MBA	3	PBC2103	AI Applications in Business	01-12-2026	Shift 1
MBA	3	PBC2104	ESG and Sustainability	01-12-2026	Shift 2
MBA	3	PBO2101	Supply Chain Analytics	02-12-2026	Shift 1
MBA	3	PBF2101	Financial Analytics	03-12-2026	Shift 1
MBA	3	PBH2104	HR Analytics	03-12-2026	Shift 1
MBA	3	PBH2105	HR Audit & HR Information Systems	03-12-2026	Shift 2
MBA	3	PBM2104	Marketing Analytics	04-12-2026	Shift 1
MBA	3	PBB2101	AI and ML for Business	07-12-2026	Shift 1
MBA	3	PBO2105	Global Logistics & Supply Chain Management	07-12-2026	Shift 2
MBA	3	PBB2105	Predictive Analytics for Business Forecasting	08-12-2026	Shift 1`,

  // Page 21: Ph.D Semesters 1, 3
  `Ph.D	1	FCMG1201	Research Methodology and Intellectual Property Rights	23-11-2026	Shift 1
Ph.D	1	FCMG1202	Research And Publication Ethics	26-11-2026	Shift 1
Ph.D	1	SECWE116	Environmental Impact Assessment	30-11-2026	Shift 1
Ph.D	1	PHPHE205	Nano Magnetic Materials & Devices	30-11-2026	Shift 1
Ph.D	1	HSHES301	Research Methodology	30-11-2026	Shift 1
Ph.D	1	SECWE118	Energy Efficient Buildings	02-12-2026	Shift 1
Ph.D	1	PHPHE301	Material Science	02-12-2026	Shift 1
Ph.D	1	PHPHE405	Energy Conversion & Storage Devices	04-12-2026	Shift 1
Ph.D	3	FCMG101	Research Methodology and Intellectual Property Rights	23-11-2026	Shift 1
Ph.D	3	FCMG102	Research And Publication Ethics	26-11-2026	Shift 1
Ph.D	3	BDDNE911	Transformational Systems Design and Foresight	30-11-2026	Shift 1
Ph.D	3	BDDNE912	AI-Driven Design	02-12-2026	Shift 1`
];

const SHIFT_TIMINGS = {
  'Shift 1': '10:00 AM - 01:00 PM',
  'Shift 2': '02:00 PM - 05:00 PM',
};

const entries = [];

for (const page of rawPages) {
  const lines = page.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t').map(p => p.trim());
    if (parts.length >= 6) {
      const degree = parts[0];
      const semester = parseInt(parts[1], 10);
      const code = parts[2].toUpperCase();
      const name = parts[3];
      const date = parts[4];
      const shift = parts[5];

      // Convert DD-MM-YYYY to YYYY-MM-DD
      const [d, m, y] = date.split('-');
      const isoDate = `${y}-${m}-${d}`;

      entries.push({
        degree,
        semester,
        code,
        name,
        date,
        isoDate,
        shift,
        time: SHIFT_TIMINGS[shift] || shift,
      });
    }
  }
}

// Build index by uppercase subject code for O(1) lookup
const byCode = {};
for (const entry of entries) {
  if (!byCode[entry.code]) byCode[entry.code] = [];
  byCode[entry.code].push(entry);
}

const datesheetPayload = {
  title: 'Tentative Date Sheet End Sem (ODD) Sem 2026-27',
  noticeNumber: 'F. No. 220(298)/Mid & End 2026-27/2026/Exam/NSUT/1002',
  noticeDate: '06/11/2026',
  shiftTimings: {
    'Shift 1': '10:00 AM - 01:00 PM',
    'Shift 2': '02:00 PM - 05:00 PM',
  },
  totalExams: entries.length,
  totalUniqueCodes: Object.keys(byCode).length,
  exams: entries,
  byCode,
};

// Write to data/datesheet.json and public/data/datesheet.json
const outPaths = [
  'D:\\nsutnest\\data\\datesheet.json',
  'D:\\nsutnest\\public\\data\\datesheet.json',
];

for (const p of outPaths) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(datesheetPayload, null, 2), 'utf-8');
  console.log(`Wrote ${entries.length} exams to ${p}`);
}
